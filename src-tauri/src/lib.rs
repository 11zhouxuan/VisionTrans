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
        .plugin(tauri_plugin_notification::init())
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
            commands::capture::trigger_capture_command,
            commands::translate::start_translation,
            commands::translate::signal_result_ready,
            commands::translate::retry_translation,
            commands::translate::test_api_connection,
            commands::translate::release_result_slot,
            commands::window::open_settings_window,
            commands::window::show_overlay_window,
            commands::window::close_overlay,
            commands::window::save_screenshot,
            commands::permission::check_permission,
            commands::permission::request_permission,
            commands::wordbook::save_word_to_wordbook,
            commands::wordbook::get_all_words,
            commands::wordbook::toggle_star_word,
            commands::wordbook::delete_word_from_wordbook,
            commands::wordbook::open_wordbook_window,
            commands::wordbook::get_default_wordbook_path,
            commands::wordbook::open_wordbook_folder,
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

            // On macOS, set activation policy to Accessory.
            // This prevents Space switching when showing windows over fullscreen apps.
            // Accessory apps don't appear in Dock and don't trigger Space switches.
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                eprintln!("[setup] Set ActivationPolicy::Accessory");
            }

            // Setup macOS application menu with "Settings" option
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, MenuItem, Submenu, PredefinedMenuItem};
                let app_name = "VisionTrans";
                let capture_item = MenuItem::with_id(app, "app_capture", "截图翻译", true, Some("CmdOrCtrl+Shift+S"))?;
                let settings_item = MenuItem::with_id(app, "app_settings", "打开设置...", true, Some("CmdOrCtrl+,"))?;
                let separator = PredefinedMenuItem::separator(app)?;
                let hide = PredefinedMenuItem::hide(app, Some(app_name))?;
                let hide_others = PredefinedMenuItem::hide_others(app, None)?;
                let show_all = PredefinedMenuItem::show_all(app, None)?;
                let separator2 = PredefinedMenuItem::separator(app)?;
                let quit = PredefinedMenuItem::quit(app, Some(app_name))?;

                let app_submenu = Submenu::with_items(
                    app,
                    app_name,
                    true,
                    &[&capture_item, &settings_item, &separator, &hide, &hide_others, &show_all, &separator2, &quit],
                )?;

                // Edit menu - required for Cmd+C/V/X/A to work in WebView input fields
                let undo = PredefinedMenuItem::undo(app, None)?;
                let redo = PredefinedMenuItem::redo(app, None)?;
                let sep_edit1 = PredefinedMenuItem::separator(app)?;
                let cut = PredefinedMenuItem::cut(app, None)?;
                let copy = PredefinedMenuItem::copy(app, None)?;
                let paste = PredefinedMenuItem::paste(app, None)?;
                let select_all = PredefinedMenuItem::select_all(app, None)?;

                let edit_submenu = Submenu::with_items(
                    app,
                    "Edit",
                    true,
                    &[&undo, &redo, &sep_edit1, &cut, &copy, &paste, &select_all],
                )?;

                let menu = Menu::with_items(app, &[&app_submenu, &edit_submenu])?;
                app.set_menu(menu)?;

                let handle = app_handle.clone();
                app.on_menu_event(move |_app, event| {
                    match event.id.as_ref() {
                        "app_capture" => {
                            // Hide settings window if visible, then capture
                            if let Some(win) = handle.get_webview_window("settings") {
                                let _ = win.hide();
                            }
                            let h = handle.clone();
                            std::thread::spawn(move || {
                                std::thread::sleep(std::time::Duration::from_millis(300));
                                let _ = hotkey::trigger_capture(&h);
                            });
                        }
                        "app_settings" => {
                            tray::open_settings_public(&handle);
                        }
                        _ => {}
                    }
                });
            }

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
            if store.get("maxConcurrency").is_none() {
                store.set("maxConcurrency", serde_json::json!(1));
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

            // Pre-create the overlay window (hidden) so subsequent captures are instant.
            // The first show() will be fast since WebView is already initialized.
            #[cfg(target_os = "macos")]
            {
                eprintln!("[setup] Pre-creating overlay window...");
                match tauri::WebviewWindowBuilder::new(
                    &app_handle,
                    "overlay",
                    tauri::WebviewUrl::App("/".into()),
                )
                .title("")
                .inner_size(800.0, 600.0)
                .position(0.0, 0.0)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .visible(false)
                .build()
                {
                    Ok(_window) => {
                        eprintln!("[setup] Overlay window pre-created (hidden, WebView warming up)");
                    }
                    Err(e) => {
                        eprintln!("[setup] Failed to pre-create overlay: {} (will create on demand)", e);
                    }
                }
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
        .run(|app_handle, event| {
            match event {
                // Prevent the app from exiting when all windows are closed
                // but allow explicit exit (e.g., from tray "quit" menu)
                tauri::RunEvent::ExitRequested { api, code, .. } => {
                    // code is Some when exit was explicitly requested (app.exit())
                    // code is None when it's triggered by all windows closing
                    if code.is_none() {
                        api.prevent_exit();
                    }
                }
                // Handle Dock icon click (macOS reopen event)
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => {
                    tray::open_settings_public(app_handle);
                }
                _ => {}
            }
        });
}
