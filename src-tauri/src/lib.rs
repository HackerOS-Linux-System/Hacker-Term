mod commands;
mod config;
mod pty_manager;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            // Transparent + frameless already set in tauri.conf.json
            window.set_decorations(false).ok();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_terminal,
            commands::write_terminal,
            commands::resize_terminal,
            commands::close_terminal,
            commands::load_config,
            commands::save_config,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HackerTerm");
}
