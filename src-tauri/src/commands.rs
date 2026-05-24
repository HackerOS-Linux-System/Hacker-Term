use crate::config::{ensure_config_exists, load_config_file, save_config_file, HkConfig};
use crate::pty_manager::{close_session, create_pty_map, resize_session, spawn_session, write_to_session, PtyMap};
use serde_json::Value;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Window};

// ──────────────────────────────────────────────
// Global PTY map (initialized once)
// ──────────────────────────────────────────────

static PTY_MAP: OnceLock<PtyMap> = OnceLock::new();

pub fn get_pty_map() -> PtyMap {
    PTY_MAP.get_or_init(create_pty_map).clone()
}

// ──────────────────────────────────────────────
// Window controls
// ──────────────────────────────────────────────

#[tauri::command]
pub fn window_minimize(window: Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn window_maximize(window: Window) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
pub fn window_close(window: Window) {
    let _ = window.close();
}

// ──────────────────────────────────────────────
// Terminal (PTY) commands
// ──────────────────────────────────────────────

#[tauri::command]
pub async fn create_terminal(
    app: AppHandle,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let map = get_pty_map();
    let map_clone = map.clone();

    let app_data = app.clone();
    let app_exit = app.clone();
    let id_clone = id.clone();

    spawn_session(
        id,
        cols,
        rows,
        map,
        move |sid, data| {
            let _ = app_data.emit("terminal-data", serde_json::json!({ "id": sid, "data": data }));
        },
        move |sid| {
            let _ = app_exit.emit("terminal-exit", serde_json::json!({ "id": sid }));
            close_session(&map_clone, &sid);
        },
    )
    .map_err(|e| e.to_string())?;

    Ok(id_clone)
}

#[tauri::command]
pub fn write_terminal(id: String, data: String) -> Result<(), String> {
    let map = get_pty_map();
    write_to_session(&map, &id, data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_terminal(id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = get_pty_map();
    resize_session(&map, &id, cols, rows).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_terminal(id: String) {
    let map = get_pty_map();
    close_session(&map, &id);
}

// ──────────────────────────────────────────────
// Config commands
// ──────────────────────────────────────────────

#[tauri::command]
pub fn load_config() -> Result<Value, String> {
    ensure_config_exists();
    let config = load_config_file();
    serde_json::to_value(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_config(config: Value) -> Result<(), String> {
    let hk: HkConfig = serde_json::from_value(config).map_err(|e| e.to_string())?;
    save_config_file(&hk).map_err(|e| e.to_string())
}
