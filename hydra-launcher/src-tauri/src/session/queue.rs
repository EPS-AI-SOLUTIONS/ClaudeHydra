use super::types::*;
use std::collections::{BinaryHeap, HashMap, VecDeque};
use std::cmp::Ordering;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::SystemTime;

/// Wrapper for priority queue ordering
#[derive(Debug)]
struct PriorityPrompt {
    prompt: QueuedPrompt,
}

impl PartialEq for PriorityPrompt {
    fn eq(&self, other: &Self) -> bool {
        self.prompt.id == other.prompt.id
    }
}

impl Eq for PriorityPrompt {}

impl PartialOrd for PriorityPrompt {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for PriorityPrompt {
    fn cmp(&self, other: &Self) -> Ordering {
        // Higher priority first, then earlier created first
        match self.prompt.priority.cmp(&other.prompt.priority) {
            Ordering::Equal => other.prompt.created_at.cmp(&self.prompt.created_at),
            ord => ord,
        }
    }
}

/// Intelligent prompt queue with priority and tab-awareness
pub struct PromptQueue {
    /// Main priority queue
    queue: BinaryHeap<PriorityPrompt>,
    /// Quick lookup by prompt ID
    prompts_by_id: HashMap<String, QueuedPrompt>,
    /// Prompts grouped by tab for fair scheduling
    prompts_by_tab: HashMap<TabId, VecDeque<String>>,
    /// Currently processing prompts (one per tab max)
    processing: HashMap<TabId, String>,
    /// Completed prompts history (limited)
    completed: VecDeque<QueuedPrompt>,
    /// Max concurrent processing (across all tabs)
    max_concurrent: usize,
    /// Stats tracking
    total_completed: usize,
    total_failed: usize,
    total_wait_ms: u64,
    total_process_ms: u64,
}

impl PromptQueue {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            queue: BinaryHeap::new(),
            prompts_by_id: HashMap::new(),
            prompts_by_tab: HashMap::new(),
            processing: HashMap::new(),
            completed: VecDeque::with_capacity(100),
            max_concurrent,
            total_completed: 0,
            total_failed: 0,
            total_wait_ms: 0,
            total_process_ms: 0,
        }
    }

    /// Add a prompt to the queue
    pub fn enqueue(&mut self, prompt: QueuedPrompt) -> String {
        let id = prompt.id.clone();
        let tab_id = prompt.tab_id.clone();

        self.prompts_by_id.insert(id.clone(), prompt.clone());

        self.prompts_by_tab
            .entry(tab_id)
            .or_insert_with(VecDeque::new)
            .push_back(id.clone());

        self.queue.push(PriorityPrompt { prompt });

        id
    }

    /// Get next prompt to process (fair round-robin among tabs)
    pub fn dequeue(&mut self) -> Option<QueuedPrompt> {
        if self.processing.len() >= self.max_concurrent {
            return None;
        }

        // Find a tab that doesn't have a processing prompt
        while let Some(priority_prompt) = self.queue.pop() {
            let prompt = priority_prompt.prompt;

            // Skip if this tab already has something processing
            if self.processing.contains_key(&prompt.tab_id) {
                // Re-queue it
                self.queue.push(PriorityPrompt { prompt });
                continue;
            }

            // Skip cancelled prompts
            if let Some(stored) = self.prompts_by_id.get(&prompt.id) {
                if stored.status == PromptStatus::Cancelled {
                    continue;
                }
            }

            // Mark as processing
            let mut prompt = prompt;
            prompt.status = PromptStatus::Processing;
            prompt.started_at = Some(
                SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64
            );

            self.prompts_by_id.insert(prompt.id.clone(), prompt.clone());
            self.processing.insert(prompt.tab_id.clone(), prompt.id.clone());

            return Some(prompt);
        }

        None
    }

    /// Mark a prompt as completed
    pub fn complete(&mut self, prompt_id: &str, response: String) {
        if let Some(mut prompt) = self.prompts_by_id.remove(prompt_id) {
            let now = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            prompt.status = PromptStatus::Completed;
            prompt.completed_at = Some(now);
            prompt.response = Some(response);

            // Update stats
            if let Some(started) = prompt.started_at {
                self.total_process_ms += now - started;
                self.total_wait_ms += started - prompt.created_at;
            }
            self.total_completed += 1;

            // Remove from processing
            self.processing.remove(&prompt.tab_id);

            // Remove from tab queue
            if let Some(tab_queue) = self.prompts_by_tab.get_mut(&prompt.tab_id) {
                tab_queue.retain(|id| id != prompt_id);
            }

            // Add to completed history
            if self.completed.len() >= 100 {
                self.completed.pop_front();
            }
            self.completed.push_back(prompt);
        }
    }

    /// Mark a prompt as failed
    pub fn fail(&mut self, prompt_id: &str, error: String) {
        if let Some(mut prompt) = self.prompts_by_id.remove(prompt_id) {
            let now = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            prompt.status = PromptStatus::Failed;
            prompt.completed_at = Some(now);
            prompt.error = Some(error);

            self.total_failed += 1;

            // Remove from processing
            self.processing.remove(&prompt.tab_id);

            // Remove from tab queue
            if let Some(tab_queue) = self.prompts_by_tab.get_mut(&prompt.tab_id) {
                tab_queue.retain(|id| id != prompt_id);
            }

            // Add to completed history
            if self.completed.len() >= 100 {
                self.completed.pop_front();
            }
            self.completed.push_back(prompt);
        }
    }

    /// Cancel a queued prompt
    pub fn cancel(&mut self, prompt_id: &str) -> bool {
        if let Some(prompt) = self.prompts_by_id.get_mut(prompt_id) {
            if prompt.status == PromptStatus::Queued {
                prompt.status = PromptStatus::Cancelled;
                return true;
            }
        }
        false
    }

    /// Cancel all prompts for a tab
    pub fn cancel_tab(&mut self, tab_id: &TabId) {
        if let Some(prompt_ids) = self.prompts_by_tab.get(tab_id) {
            for id in prompt_ids.iter() {
                if let Some(prompt) = self.prompts_by_id.get_mut(id) {
                    if prompt.status == PromptStatus::Queued {
                        prompt.status = PromptStatus::Cancelled;
                    }
                }
            }
        }
    }

    /// Get queue position for a prompt
    pub fn get_position(&self, prompt_id: &str) -> Option<usize> {
        let prompt = self.prompts_by_id.get(prompt_id)?;

        if prompt.status != PromptStatus::Queued {
            return None;
        }

        // Count prompts ahead with higher or equal priority
        let mut position = 0;
        for p in self.prompts_by_id.values() {
            if p.status == PromptStatus::Queued
                && p.id != prompt_id
                && (p.priority > prompt.priority
                    || (p.priority == prompt.priority && p.created_at < prompt.created_at))
            {
                position += 1;
            }
        }

        Some(position)
    }

    /// Get prompts for a specific tab
    pub fn get_tab_prompts(&self, tab_id: &TabId) -> Vec<QueuedPrompt> {
        self.prompts_by_tab
            .get(tab_id)
            .map(|ids| {
                ids.iter()
                    .filter_map(|id| self.prompts_by_id.get(id).cloned())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get current queue statistics
    pub fn get_stats(&self) -> QueueStats {
        let queued_count = self.prompts_by_id
            .values()
            .filter(|p| p.status == PromptStatus::Queued)
            .count();

        QueueStats {
            total_queued: queued_count,
            processing: self.processing.len(),
            completed_today: self.total_completed,
            failed_today: self.total_failed,
            average_wait_ms: if self.total_completed > 0 {
                self.total_wait_ms / self.total_completed as u64
            } else {
                0
            },
            average_process_ms: if self.total_completed > 0 {
                self.total_process_ms / self.total_completed as u64
            } else {
                0
            },
        }
    }

    /// Check if a tab has any processing prompts
    pub fn is_tab_busy(&self, tab_id: &TabId) -> bool {
        self.processing.contains_key(tab_id)
    }

    /// Get the currently processing prompt for a tab
    pub fn get_processing(&self, tab_id: &TabId) -> Option<&QueuedPrompt> {
        self.processing
            .get(tab_id)
            .and_then(|id| self.prompts_by_id.get(id))
    }
}

/// Thread-safe queue wrapper
pub type SharedQueue = Arc<Mutex<PromptQueue>>;

pub fn create_shared_queue(max_concurrent: usize) -> SharedQueue {
    Arc::new(Mutex::new(PromptQueue::new(max_concurrent)))
}
