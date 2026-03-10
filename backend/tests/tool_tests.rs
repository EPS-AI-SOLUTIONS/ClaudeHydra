use serde_json::json;
use claudehydra_backend::tools::ToolExecutor;

#[tokio::test]
async fn test_tool_write_and_read_file() {
    // Setup: Use a temp directory for testing
    let temp_dir = std::env::temp_dir().join("claudehydra_tests");
    std::fs::create_dir_all(&temp_dir).unwrap();
    
    // Set ALLOWED_FILE_DIRS env var for the test
    unsafe {
        std::env::set_var("ALLOWED_FILE_DIRS", temp_dir.to_string_lossy().to_string());
    }
    
    let executor = ToolExecutor::default();
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
    assert!(result.contains("Written"), "Unexpected write result: {}", result);

    // 2. Read File
    let read_input = json!({
        "path": file_name
    });

    let (read_result, is_read_error) = executor.execute("read_file", &read_input).await;
    assert!(!is_read_error, "read_file failed: {}", read_result);
    assert_eq!(read_result, file_content, "Read content mismatch");

    // Cleanup
    let _ = std::fs::remove_dir_all(temp_dir);
}

#[tokio::test]
async fn test_tool_list_directory() {
    let temp_dir = std::env::temp_dir().join("claudehydra_tests_ls");
    if temp_dir.exists() {
        std::fs::remove_dir_all(&temp_dir).unwrap();
    }
    std::fs::create_dir_all(&temp_dir).unwrap();
    unsafe {
        std::env::set_var("ALLOWED_FILE_DIRS", temp_dir.to_string_lossy().to_string());
    }
    
    let executor = ToolExecutor::default();

    // Create some dummy files
    std::fs::write(temp_dir.join("a.txt"), "A").unwrap();
    std::fs::create_dir(temp_dir.join("sub")).unwrap();
    std::fs::write(temp_dir.join("sub/b.txt"), "B").unwrap();

    let list_input = json!({
        "path": temp_dir.to_string_lossy(),
        "recursive": true
    });

    let (result, is_error) = executor.execute("list_directory", &list_input).await;
    assert!(!is_error, "list_directory failed: {}", result);

    println!("List Result:\n{}", result);

    assert!(result.contains("a.txt"), "Missing a.txt in listing: {}", result);
    assert!(result.contains("sub"), "Missing sub/ in listing: {}", result);

    // Check for b.txt regardless of path separator
    let has_b = result.contains("sub/b.txt") || result.contains("sub\\b.txt");
    assert!(has_b, "Missing sub/b.txt in listing (found: {})", result);

    let _ = std::fs::remove_dir_all(temp_dir);
}
