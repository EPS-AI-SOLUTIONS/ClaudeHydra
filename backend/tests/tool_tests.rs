use claudehydra_backend::tools::ToolExecutor;
use serde_json::json;
use std::sync::Once;

/// Set ALLOWED_FILE_DIRS once (to a known parent directory) so that
/// parallel tests don't interfere with each other via env::set_var races.
static INIT_ENV: Once = Once::new();

fn test_temp_base() -> std::path::PathBuf {
    let base = std::env::temp_dir().join("claudehydra_tool_tests");
    INIT_ENV.call_once(|| {
        std::fs::create_dir_all(&base).unwrap();
        unsafe {
            std::env::set_var("ALLOWED_FILE_DIRS", base.to_string_lossy().to_string());
        }
    });
    base
}

#[tokio::test]
async fn test_tool_write_and_read_file() {
    let base = test_temp_base();
    let work_dir = base.join("write_read");
    std::fs::create_dir_all(&work_dir).unwrap();

    let executor = ToolExecutor::default()
        .with_working_directory(&work_dir.to_string_lossy());

    let file_name = "test_file_op.txt";
    let file_content = "Hello from automated test!";

    // 1. Write File
    let write_input = json!({
        "path": file_name,
        "content": file_content,
        "create_dirs": true
    });

    let (result, is_error) = executor.execute("write_file", &write_input).await;
    assert!(!is_error, "write_file failed: {}", result);
    assert!(
        result.contains("Written"),
        "Unexpected write result: {}",
        result
    );

    // 2. Read File
    let read_input = json!({
        "path": file_name
    });

    let (read_result, is_read_error) = executor.execute("read_file", &read_input).await;
    assert!(!is_read_error, "read_file failed: {}", read_result);
    assert_eq!(read_result, file_content, "Read content mismatch");

    // Cleanup
    let _ = std::fs::remove_dir_all(work_dir);
}

#[tokio::test]
async fn test_tool_list_directory() {
    let base = test_temp_base();
    let work_dir = base.join("list_dir");
    if work_dir.exists() {
        let _ = std::fs::remove_dir_all(&work_dir);
    }
    std::fs::create_dir_all(&work_dir).unwrap();

    let executor = ToolExecutor::default()
        .with_working_directory(&work_dir.to_string_lossy());

    // Create some dummy files
    std::fs::write(work_dir.join("a.txt"), "A").unwrap();
    std::fs::create_dir(work_dir.join("sub")).unwrap();
    std::fs::write(work_dir.join("sub/b.txt"), "B").unwrap();

    // Use "." (relative to working_directory) instead of absolute path
    let list_input = json!({
        "path": ".",
        "recursive": true
    });

    let (result, is_error) = executor.execute("list_directory", &list_input).await;
    assert!(!is_error, "list_directory failed: {}", result);

    assert!(
        result.contains("a.txt"),
        "Missing a.txt in listing: {}",
        result
    );
    assert!(
        result.contains("sub"),
        "Missing sub/ in listing: {}",
        result
    );

    // Check for b.txt regardless of path separator
    let has_b = result.contains("sub/b.txt") || result.contains("sub\\b.txt");
    assert!(has_b, "Missing sub/b.txt in listing (found: {})", result);

    let _ = std::fs::remove_dir_all(work_dir);
}
