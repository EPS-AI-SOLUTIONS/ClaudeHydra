use actix_cors::Cors;
use actix_files as fs;
use actix_web::{get, web, App, HttpResponse, HttpServer, Responder};
use serde::Serialize;
use std::fs::read_to_string;
use std::path::Path;
use std::sync::Mutex;
use sysinfo::{CpuExt, System, SystemExt};

struct AppState {
    sys: Mutex<System>,
}

#[derive(Serialize)]
struct SystemStats {
    cpu_usage: f32,
    memory_used: u64,
    memory_total: u64,
    uptime: u64,
    platform: String,
}

#[derive(Serialize)]
struct StatusResponse {
    status: String,
    version: String,
    mode: String,
}

#[get("/api/status")]
async fn status() -> impl Responder {
    HttpResponse::Ok().json(StatusResponse {
        status: "Online".to_string(),
        version: "HYDRA v2.2.0".to_string(),
        mode: "Standard".to_string(),
    })
}

#[get("/api/system")]
async fn get_system_stats(data: web::Data<AppState>) -> impl Responder {
    let mut sys = data.sys.lock().unwrap();
    sys.refresh_cpu();
    sys.refresh_memory();

    let stats = SystemStats {
        cpu_usage: sys.global_cpu_info().cpu_usage(),
        memory_used: sys.used_memory(),
        memory_total: sys.total_memory(),
        uptime: sys.uptime(),
        platform: sys.name().unwrap_or_else(|| "Unknown".to_string()),
    };

    HttpResponse::Ok().json(stats)
}

#[get("/api/logs")]
async fn get_logs() -> impl Responder {
    // Relative path from src/dashboard/src to .hydra-data/logs
    // Assuming run from src/dashboard/
    let log_path = "../../.hydra-data/logs/audit.log";
    
    match read_to_string(log_path) {
        Ok(content) => {
            // Take last 50 lines only to avoid huge payloads
            let lines: Vec<&str> = content.lines().rev().take(50).collect();
            let truncated = lines.into_iter().rev().collect::<Vec<&str>>().join("\n");
            HttpResponse::Ok().body(truncated)
        },
        Err(_) => HttpResponse::Ok().body("No logs available or file not found."),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("🐺 HYDRA Dashboard v0.2.0 starting...");
    println!("   > http://localhost:8080");

    let app_state = web::Data::new(AppState {
        sys: Mutex::new(System::new_all()),
    });

    HttpServer::new(move || {
        let cors = Cors::permissive();

        App::new()
            .wrap(cors)
            .app_data(app_state.clone())
            .service(status)
            .service(get_system_stats)
            .service(get_logs)
            .service(fs::Files::new("/", "./static").index_file("index.html"))
    })
    .bind(("127.0.0.1", 8080))?
    .run()
    .await
}