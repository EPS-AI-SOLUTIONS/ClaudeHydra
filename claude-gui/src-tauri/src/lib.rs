mod agentic;
mod anthropic;
mod bridge;
mod chat_history;
mod claude;
mod commands;
mod debug;
mod learning;
mod memory;
mod ollama;
mod ollama_commands;
mod parallel;

use tauri::Manager;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    let _ = tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .try_init();

    // DevTools - only in debug builds for performance/security
    #[cfg(debug_assertions)]
    let devtools = tauri_plugin_devtools::init();

    let mut builder = tauri::Builder::default();

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(devtools);
        tracing::info!("DevTools enabled (debug build)");
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Initialize Claude state
            let claude_state = claude::state::AppState::new();
            app.manage(claude_state);

            // Initialize Ollama state
            let ollama_state = ollama_commands::OllamaState::new();
            app.manage(ollama_state);

            // Initialize Debug LiveView
            debug::init();

            // Open DevTools automatically in debug builds
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                    tracing::info!("DevTools window opened");
                }
            }

            tracing::info!("Claude HYDRA initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Claude commands
            commands::start_claude_session,
            commands::stop_claude_session,
            commands::send_input,
            commands::approve_action,
            commands::deny_action,
            commands::get_approval_rules,
            commands::update_approval_rules,
            commands::toggle_auto_approve_all,
            commands::get_session_status,
            commands::get_approval_history,
            commands::clear_approval_history,
            // Anthropic commands
            anthropic::anthropic_list_models,
            // Ollama commands
            ollama_commands::ollama_list_models,
            ollama_commands::ollama_health_check,
            ollama_commands::ollama_generate,
            ollama_commands::ollama_generate_sync,
            ollama_commands::ollama_chat,
            ollama_commands::ollama_batch_generate,
            ollama_commands::get_cpu_info,
            // Chat history commands
            chat_history::list_chat_sessions,
            chat_history::get_chat_session,
            chat_history::create_chat_session,
            chat_history::add_chat_message,
            chat_history::delete_chat_session,
            chat_history::update_chat_title,
            chat_history::clear_all_chats,
            // Agentic commands
            agentic::execute_command,
            // Bridge IPC commands
            bridge::get_bridge_state,
            bridge::set_bridge_auto_approve,
            bridge::approve_bridge_request,
            bridge::reject_bridge_request,
            bridge::clear_bridge_requests,
            // Memory commands
            memory::get_agent_memories,
            memory::add_agent_memory,
            memory::clear_agent_memories,
            memory::get_knowledge_graph,
            memory::update_knowledge_graph,
            // Learning commands
            learning::learning_get_stats,
            learning::learning_get_preferences,
            learning::learning_save_preferences,
            learning::learning_rag_search,
            learning::learning_rag_add,
            learning::learning_rag_clear,
            learning::learning_collect_training,
            learning::learning_get_training_examples,
            learning::learning_export_for_finetune,
            learning::learning_pull_embedding_model,
            // Alzur (AI Trainer) commands
            learning::write_training_dataset,
            learning::start_model_training,
            learning::cancel_model_training,
            learning::get_alzur_models,
            // Debug LiveView commands
            debug::debug_get_stats,
            debug::debug_get_logs,
            debug::debug_get_ipc_history,
            debug::debug_get_snapshot,
            debug::debug_clear_logs,
            debug::debug_add_log,
            debug::debug_start_streaming,
            debug::debug_stop_streaming,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
