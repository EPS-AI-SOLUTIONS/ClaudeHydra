mod config;
mod commands;
mod mcp;
mod process;
mod logger;
mod session;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Legacy commands (backward compatibility)
            commands::check_mcp_health,
            commands::get_system_metrics,
            commands::load_hydra_config,
            commands::launch_claude,
            commands::check_ollama,
            commands::get_ollama_models,
            commands::get_ollama_status_cmd,
            commands::start_ollama_cmd,
            commands::stop_ollama_cmd,
            commands::restart_ollama_cmd,
            commands::set_yolo_mode,
            commands::start_claude_session,
            commands::send_to_claude,
            // New tab management commands
            commands::create_tab,
            commands::close_tab,
            commands::get_tabs,
            commands::get_tab,
            commands::rename_tab,
            // New queue commands
            commands::send_prompt,
            commands::process_next_prompt,
            commands::get_queue_stats,
            commands::is_tab_busy,
            commands::cancel_prompt,
            // Conflict detection commands
            commands::register_tab_files,
            commands::get_tab_conflicts,
            // SWARM logger commands
            commands::append_to_log,
            commands::read_swarm_logs,
            // Build freshness check
            commands::check_build_freshness,
        ])
        .manage(commands::AppState::default())
        .setup(|_app| {
            // Initialize file logger
            if let Err(e) = logger::FileLogger::init() {
                eprintln!("Failed to init logger: {}", e);
            } else {
                logger::log_info("HYDRA 10.6.1 Launcher started - Multi-Tab Edition");
                logger::log_info("Tauri application setup complete");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
