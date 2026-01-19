use super::types::*;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::SystemTime;

/// Detects and tracks conflicts between tabs working on the same files
pub struct ConflictDetector {
    /// Files -> Set of tabs that are working on them
    file_to_tabs: HashMap<String, HashSet<TabId>>,
    /// Tab -> Set of files it's working on
    tab_to_files: HashMap<TabId, HashSet<String>>,
    /// Active conflicts
    conflicts: Vec<FileConflict>,
    /// File modification timestamps when last read
    file_timestamps: HashMap<String, u64>,
}

impl ConflictDetector {
    pub fn new() -> Self {
        Self {
            file_to_tabs: HashMap::new(),
            tab_to_files: HashMap::new(),
            conflicts: Vec::new(),
            file_timestamps: HashMap::new(),
        }
    }

    /// Register that a tab is working on certain files
    pub fn register_files(&mut self, tab_id: &TabId, files: Vec<String>) {
        // Remove old file associations for this tab
        if let Some(old_files) = self.tab_to_files.remove(tab_id) {
            for file in old_files {
                if let Some(tabs) = self.file_to_tabs.get_mut(&file) {
                    tabs.remove(tab_id);
                    if tabs.is_empty() {
                        self.file_to_tabs.remove(&file);
                    }
                }
            }
        }

        // Add new file associations
        let mut tab_files = HashSet::new();
        for file in files {
            let normalized = Self::normalize_path(&file);

            // Record file timestamp if not already tracked
            if !self.file_timestamps.contains_key(&normalized) {
                if let Ok(metadata) = std::fs::metadata(&file) {
                    if let Ok(modified) = metadata.modified() {
                        let ts = modified
                            .duration_since(SystemTime::UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as u64;
                        self.file_timestamps.insert(normalized.clone(), ts);
                    }
                }
            }

            self.file_to_tabs
                .entry(normalized.clone())
                .or_insert_with(HashSet::new)
                .insert(tab_id.clone());

            tab_files.insert(normalized);
        }

        self.tab_to_files.insert(tab_id.clone(), tab_files);

        // Check for new conflicts
        self.detect_conflicts();
    }

    /// Clear file associations for a tab (when closing)
    pub fn unregister_tab(&mut self, tab_id: &TabId) {
        if let Some(files) = self.tab_to_files.remove(tab_id) {
            for file in files {
                if let Some(tabs) = self.file_to_tabs.get_mut(&file) {
                    tabs.remove(tab_id);
                    if tabs.is_empty() {
                        self.file_to_tabs.remove(&file);
                    }
                }
            }
        }

        // Remove conflicts involving this tab
        self.conflicts.retain(|c| !c.tabs_involved.contains(tab_id));
    }

    /// Detect conflicts between tabs
    fn detect_conflicts(&mut self) {
        self.conflicts.clear();
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        for (file, tabs) in &self.file_to_tabs {
            if tabs.len() > 1 {
                // Multiple tabs working on same file
                self.conflicts.push(FileConflict {
                    file_path: file.clone(),
                    tabs_involved: tabs.iter().cloned().collect(),
                    conflict_type: ConflictType::ConcurrentEdit,
                    detected_at: now,
                });
            }
        }
    }

    /// Check if a file has been modified externally since we last read it
    pub fn check_external_change(&mut self, file_path: &str) -> bool {
        let normalized = Self::normalize_path(file_path);

        if let Some(&old_ts) = self.file_timestamps.get(&normalized) {
            if let Ok(metadata) = std::fs::metadata(file_path) {
                if let Ok(modified) = metadata.modified() {
                    let current_ts = modified
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64;

                    if current_ts > old_ts {
                        // File was modified externally
                        self.file_timestamps.insert(normalized.clone(), current_ts);

                        // Create conflict for all tabs working on this file
                        if let Some(tabs) = self.file_to_tabs.get(&normalized) {
                            if !tabs.is_empty() {
                                let now = SystemTime::now()
                                    .duration_since(SystemTime::UNIX_EPOCH)
                                    .unwrap()
                                    .as_millis() as u64;

                                self.conflicts.push(FileConflict {
                                    file_path: normalized,
                                    tabs_involved: tabs.iter().cloned().collect(),
                                    conflict_type: ConflictType::ExternalChange,
                                    detected_at: now,
                                });

                                return true;
                            }
                        }
                    }
                }
            }
        }

        false
    }

    /// Update file timestamp after writing
    pub fn update_file_timestamp(&mut self, file_path: &str) {
        let normalized = Self::normalize_path(file_path);
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        self.file_timestamps.insert(normalized, now);
    }

    /// Get all current conflicts
    pub fn get_conflicts(&self) -> &[FileConflict] {
        &self.conflicts
    }

    /// Get conflicts for a specific tab
    pub fn get_tab_conflicts(&self, tab_id: &TabId) -> Vec<&FileConflict> {
        self.conflicts
            .iter()
            .filter(|c| c.tabs_involved.contains(tab_id))
            .collect()
    }

    /// Check if a tab has any conflicts
    pub fn has_conflicts(&self, tab_id: &TabId) -> bool {
        self.conflicts.iter().any(|c| c.tabs_involved.contains(tab_id))
    }

    /// Resolve a conflict (mark it as handled)
    pub fn resolve_conflict(&mut self, file_path: &str) {
        let normalized = Self::normalize_path(file_path);
        self.conflicts.retain(|c| c.file_path != normalized);
    }

    /// Get files being worked on by a tab
    pub fn get_tab_files(&self, tab_id: &TabId) -> Vec<String> {
        self.tab_to_files
            .get(tab_id)
            .map(|f| f.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Check if a prompt might cause conflicts
    pub fn would_conflict(&self, tab_id: &TabId, files: &[String]) -> Vec<FileConflict> {
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let mut potential_conflicts = Vec::new();

        for file in files {
            let normalized = Self::normalize_path(file);

            if let Some(tabs) = self.file_to_tabs.get(&normalized) {
                let other_tabs: Vec<TabId> = tabs
                    .iter()
                    .filter(|t| *t != tab_id)
                    .cloned()
                    .collect();

                if !other_tabs.is_empty() {
                    potential_conflicts.push(FileConflict {
                        file_path: normalized,
                        tabs_involved: other_tabs,
                        conflict_type: ConflictType::ConcurrentEdit,
                        detected_at: now,
                    });
                }
            }
        }

        potential_conflicts
    }

    /// Normalize file path for consistent comparison
    fn normalize_path(path: &str) -> String {
        // Convert to absolute path and normalize separators
        let path = Path::new(path);
        if path.is_absolute() {
            path.to_string_lossy().to_string().replace('\\', "/")
        } else {
            // Try to make absolute
            if let Ok(abs) = std::env::current_dir() {
                abs.join(path)
                    .to_string_lossy()
                    .to_string()
                    .replace('\\', "/")
            } else {
                path.to_string_lossy().to_string().replace('\\', "/")
            }
        }
    }
}

impl Default for ConflictDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conflict_detection() {
        let mut detector = ConflictDetector::new();

        // Tab 1 works on file A
        detector.register_files(&"tab1".to_string(), vec!["file_a.rs".to_string()]);
        assert!(detector.get_conflicts().is_empty());

        // Tab 2 works on different file
        detector.register_files(&"tab2".to_string(), vec!["file_b.rs".to_string()]);
        assert!(detector.get_conflicts().is_empty());

        // Tab 2 now also works on file A - conflict!
        detector.register_files(
            &"tab2".to_string(),
            vec!["file_a.rs".to_string(), "file_b.rs".to_string()],
        );
        assert_eq!(detector.get_conflicts().len(), 1);
        assert!(detector.has_conflicts(&"tab1".to_string()));
        assert!(detector.has_conflicts(&"tab2".to_string()));
    }

    #[test]
    fn test_unregister_tab() {
        let mut detector = ConflictDetector::new();

        detector.register_files(&"tab1".to_string(), vec!["file.rs".to_string()]);
        detector.register_files(&"tab2".to_string(), vec!["file.rs".to_string()]);
        assert_eq!(detector.get_conflicts().len(), 1);

        detector.unregister_tab(&"tab1".to_string());
        assert!(detector.get_conflicts().is_empty());
    }
}
