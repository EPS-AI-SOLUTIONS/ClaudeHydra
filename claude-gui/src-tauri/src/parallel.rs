//! Parallel Processing Module - wykorzystaj wszystkie rdzenie CPU!
//!
//! Zapewnia thread pool i narzędzia do równoległego przetwarzania.

#![allow(dead_code)]

use rayon::prelude::*;
use std::sync::Arc;
use parking_lot::RwLock;

/// Informacje o CPU
pub fn cpu_info() -> CpuInfo {
    let num_cores = num_cpus::get();
    let num_physical = num_cpus::get_physical();

    CpuInfo {
        logical_cores: num_cores,
        physical_cores: num_physical,
        rayon_threads: rayon::current_num_threads(),
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CpuInfo {
    pub logical_cores: usize,
    pub physical_cores: usize,
    pub rayon_threads: usize,
}

/// Przetwarza elementy równolegle z progress callback
pub fn parallel_process<T, R, F>(
    items: Vec<T>,
    processor: F,
    progress: Option<Arc<RwLock<usize>>>,
) -> Vec<R>
where
    T: Send + Sync,
    R: Send,
    F: Fn(T) -> R + Send + Sync,
{
    items
        .into_par_iter()
        .map(|item| {
            let result = processor(item);
            if let Some(ref p) = progress {
                let mut count = p.write();
                *count += 1;
            }
            result
        })
        .collect()
}

/// Parallel batch processing z limitem
pub fn parallel_batch<T, R, F>(
    items: Vec<T>,
    batch_size: usize,
    processor: F,
) -> Vec<R>
where
    T: Send + Sync + Clone,
    R: Send,
    F: Fn(&[T]) -> Vec<R> + Send + Sync,
{
    items
        .par_chunks(batch_size)
        .flat_map(|chunk| processor(chunk))
        .collect()
}

/// Parallel string search (fuzzy matching)
pub fn parallel_fuzzy_search(
    data: &[String],
    query: &str,
    threshold: f64,
) -> Vec<(String, f64)> {
    let query_lower = query.to_lowercase();

    data.par_iter()
        .filter_map(|item| {
            let item_lower = item.to_lowercase();
            let score = similarity(&query_lower, &item_lower);
            if score >= threshold {
                Some((item.clone(), score))
            } else {
                None
            }
        })
        .collect()
}

/// Simple similarity score (Jaccard-like)
fn similarity(a: &str, b: &str) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }

    let a_chars: std::collections::HashSet<char> = a.chars().collect();
    let b_chars: std::collections::HashSet<char> = b.chars().collect();

    let intersection = a_chars.intersection(&b_chars).count();
    let union = a_chars.union(&b_chars).count();

    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

/// Parallel JSON parsing
pub fn parallel_parse_json<T>(json_strings: Vec<String>) -> Vec<Result<T, String>>
where
    T: serde::de::DeserializeOwned + Send,
{
    json_strings
        .into_par_iter()
        .map(|s| {
            serde_json::from_str(&s).map_err(|e| e.to_string())
        })
        .collect()
}

/// Parallel file hashing (for large datasets)
pub fn parallel_hash_strings(strings: Vec<String>) -> Vec<u64> {
    use std::hash::{Hash, Hasher};
    use std::collections::hash_map::DefaultHasher;

    strings
        .into_par_iter()
        .map(|s| {
            let mut hasher = DefaultHasher::new();
            s.hash(&mut hasher);
            hasher.finish()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cpu_info() {
        let info = cpu_info();
        assert!(info.logical_cores > 0);
        assert!(info.physical_cores > 0);
        assert!(info.rayon_threads > 0);
    }

    #[test]
    fn test_parallel_process() {
        let items = vec![1, 2, 3, 4, 5];
        let results: Vec<i32> = parallel_process(items, |x| x * 2, None);
        assert_eq!(results.len(), 5);
    }

    #[test]
    fn test_fuzzy_search() {
        let data = vec![
            "hello".to_string(),
            "world".to_string(),
            "help".to_string(),
        ];
        let results = parallel_fuzzy_search(&data, "hel", 0.3);
        assert!(!results.is_empty());
    }
}
