pub mod commands;
pub mod errors;
pub mod hotkey;
pub mod services;
pub mod state;
pub mod tray;

use state::AppState;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the settings window if another instance tries to start
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::capture::get_screenshot,
            commands::translate::start_translation,
            commands::translate::retry_translation,
            commands::translate::test_api_connection,
            commands::window::open_settings_window,
            commands::window::close_overlay,
            commands::permission::check_permission,
            commands::permission::request_permission,
            hotkey::update_hotkey,
        ])
        .on_window_event(|_window, event| {
            // Prevent app from exiting when all windows are closed
            // This is essential for a tray-based app
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // For the main window, prevent close and hide instead
                if _window.label() == "main" {
                    api.prevent_close();
                }
                // For other windows (settings, onboarding, etc.), just let them close
                // The app will keep running because of the tray
            }
        })
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize config store with defaults
            let store = app
                .store("config.json")
                .expect("Failed to initialize config store");
            if store.get("provider").is_none() {
                store.set("provider", serde_json::json!("openai"));
            }
            if store.get("hotkey").is_none() {
                store.set("hotkey", serde_json::json!("Alt+Q"));
            }
            if store.get("endpoint").is_none() {
                store.set("endpoint", serde_json::json!("https://api.openai.com/v1"));
            }
            if store.get("model").is_none() {
                store.set("model", serde_json::json!("gpt-4o"));
            }
            if store.get("targetLanguage").is_none() {
                store.set("targetLanguage", serde_json::json!("zh"));
            }
            if store.get("bedrockModelId").is_none() {
                store.set(
                    "bedrockModelId",
                    serde_json::json!("us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
                );
            }
            if store.get("bedrockRegion").is_none() {
                store.set("bedrockRegion", serde_json::json!("us-east-1"));
            }
            let _ = store.save();

            // Setup system tray
            if let Err(e) = tray::setup_tray(&app_handle) {
                eprintln!("Failed to setup tray: {}", e);
            }

            // Setup global hotkey
            if let Err(e) = hotkey::setup_hotkey(&app_handle) {
                eprintln!("Failed to setup hotkey: {}", e);
            }

            // Check if onboarding is needed
            let onboarding_completed = store
                .get("onboardingCompleted")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if !onboarding_completed {
                // Open onboarding window
                let _window = tauri::WebviewWindowBuilder::new(
                    &app_handle,
                    "onboarding",
                    tauri::WebviewUrl::App("/".into()),
                )
                .title("VisionTrans - 欢迎")
                .inner_size(480.0, 640.0)
                .center()
                .resizable(false)
                .build()
                .expect("Failed to create onboarding window");
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // Prevent the app from exiting when all windows are closed
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}
