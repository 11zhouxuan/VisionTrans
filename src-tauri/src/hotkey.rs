use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_store::StoreExt;

use crate::errors::AppError;
use crate::services::screenshot;
use crate::state::AppState;

/// Setup global hotkey on app startup
pub fn setup_hotkey(app: &AppHandle) -> Result<(), AppError> {
    let hotkey_str = get_configured_hotkey(app);
    register_hotkey(app, &hotkey_str)
}

/// Register a global hotkey
pub fn register_hotkey(app: &AppHandle, hotkey_str: &str) -> Result<(), AppError> {
    let app_handle = app.clone();
    app.global_shortcut()
        .on_shortcut(hotkey_str, move |_app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let _ = trigger_capture(&app_handle);
            }
        })
        .map_err(|e| AppError::Internal(format!("Failed to register hotkey '{}': {}", hotkey_str, e)))?;

    Ok(())
}

/// Update global hotkey (unregister old, register new)
#[tauri::command]
pub async fn update_hotkey(app: AppHandle, hotkey: String) -> Result<bool, AppError> {
    // Unregister all existing shortcuts
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| AppError::Internal(format!("Failed to unregister hotkeys: {}", e)))?;

    // Register new hotkey
    register_hotkey(&app, &hotkey)?;

    Ok(true)
}

fn get_configured_hotkey(app: &AppHandle) -> String {
    if let Ok(store) = app.store("config.json") {
        if let Some(value) = store.get("hotkey") {
            if let Some(hotkey) = value.as_str() {
                return hotkey.to_string();
            }
        }
    }
    "Alt+Q".to_string()
}

pub fn trigger_capture(app: &AppHandle) -> Result<(), AppError> {
    let state = app.state::<AppState>();

    // Prevent duplicate triggers
    {
        let mut is_capturing = state.is_capturing.lock().unwrap();
        if *is_capturing {
            return Ok(());
        }
        *is_capturing = true;
    }

    // Check if paused
    {
        let is_paused = state.is_paused.lock().unwrap();
        if *is_paused {
            *state.is_capturing.lock().unwrap() = false;
            return Ok(());
        }
    }

    // Check concurrency limit before proceeding with capture
    {
        let max_concurrency = app.store("config.json")
            .ok()
            .and_then(|s| s.get("maxConcurrency"))
            .and_then(|v| v.as_u64())
            .map(|v| v as usize)
            .unwrap_or(1)
            .max(1);

        let active_count = state.active_count();
        if active_count >= max_concurrency {
            *state.is_capturing.lock().unwrap() = false;
            eprintln!("[hotkey] Capture blocked: concurrency limit reached ({}/{})", active_count, max_concurrency);

            let notif_result = app.notification()
                .builder()
                .title("VisionTrans")
                .body(format!(
                    "当前已有 {} 个翻译任务进行中，请等待完成后再试",
                    active_count
                ))
                .show();
            if let Err(e) = notif_result {
                eprintln!("[hotkey] Notification plugin failed: {}", e);
            }

            #[cfg(target_os = "macos")]
            {
                let msg = format!(
                    "当前已有 {} 个翻译任务进行中，请等待完成后再试",
                    active_count
                );
                let _ = std::process::Command::new("osascript")
                    .args(["-e", &format!(
                        "display notification \"{}\" with title \"VisionTrans\"",
                        msg
                    )])
                    .spawn();
            }

            return Ok(());
        }
    }

    // Check screen recording permission on macOS
    #[cfg(target_os = "macos")]
    {
        if !crate::services::permission::check_screen_recording_permission() {
            *state.is_capturing.lock().unwrap() = false;
            crate::services::permission::request_screen_recording_permission();
            return Err(AppError::ScreenRecordingPermissionDenied);
        }
    }

    // Capture screen
    let screenshot_data = match screenshot::capture_current_screen() {
        Ok(data) => data,
        Err(e) => {
            *state.is_capturing.lock().unwrap() = false;
            return Err(e);
        }
    };

    // Store screenshot data
    *state.last_screenshot.lock().unwrap() = Some(screenshot_data.clone());

    // Show overlay window
    show_overlay_window(app, &screenshot_data)?;

    Ok(())
}

/// Configure NSWindow properties for fullscreen overlay on macOS.
/// This is called both at app startup (pre-creation) and when showing the overlay.
/// Public so it can be called from lib.rs setup.
#[cfg(target_os = "macos")]
pub fn configure_overlay_ns_window(window: &tauri::WebviewWindow) -> usize {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    match window.ns_window() {
        Ok(ptr) => {
            let ns_window = ptr as *mut AnyObject;
            unsafe {
                // 1. Set window level to screenSaver (1000)
                let _: () = msg_send![ns_window, setLevel: 1000_i64];

                // 2. Set collection behavior:
                //    canJoinAllSpaces (1) | stationary (16) | ignoresCycle (64) | fullScreenAuxiliary (256)
                let behavior: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
                let _: () = msg_send![ns_window, setCollectionBehavior: behavior];

                // 3. Ensure window receives mouse events
                let _: () = msg_send![ns_window, setIgnoresMouseEvents: false];

                let actual_level: i64 = msg_send![ns_window, level];
                let actual_behavior: usize = msg_send![ns_window, collectionBehavior];
                eprintln!("[overlay] NSWindow configured: level={}, behavior={}", actual_level, actual_behavior);
            }
            ptr as usize
        }
        Err(e) => {
            eprintln!("[overlay] Failed to get ns_window: {}", e);
            0
        }
    }
}

/// Show the overlay window. Reuses the pre-created window on macOS,
/// or creates a new one on other platforms.
fn show_overlay_window(
    app: &AppHandle,
    screenshot: &crate::state::ScreenshotData,
) -> Result<(), AppError> {
    let overlay_w = screenshot.logical_width as f64;
    let overlay_h = screenshot.logical_height as f64;

    // Try to reuse existing overlay window (pre-created at startup on macOS)
    if let Some(existing) = app.get_webview_window("overlay") {
        eprintln!("[overlay] Reusing pre-created overlay window");

        // Resize to match current screen
        let _ = existing.set_size(tauri::LogicalSize::new(overlay_w, overlay_h));
        let _ = existing.set_position(tauri::LogicalPosition::new(0.0, 0.0));

        // Reload the page to pick up new screenshot data
        let _ = existing.eval("window.location.reload()");

        // Re-configure and show
        #[cfg(target_os = "macos")]
        {
            let ns_window_addr = configure_overlay_ns_window(&existing);
            let app_handle = app.clone();
            std::thread::spawn(move || {
                // Brief delay for page reload
                std::thread::sleep(std::time::Duration::from_millis(300));
                let addr = ns_window_addr;
                let _ = app_handle.run_on_main_thread(move || {
                    if addr != 0 {
                        use objc2::msg_send;
                        use objc2::runtime::AnyObject;
                        unsafe {
                            let ns_window = addr as *mut AnyObject;
                            // Re-apply properties
                            let _: () = msg_send![ns_window, setLevel: 1000_i64];
                            let behavior: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
                            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
                            let _: () = msg_send![ns_window, setIgnoresMouseEvents: false];
                            // Restore alpha (was set to 0 when "hidden")
                            let _: () = msg_send![ns_window, setAlphaValue: 1.0_f64];
                            // Make key window for keyboard events
                            let _: () = msg_send![ns_window, makeKeyWindow];
                            eprintln!("[overlay] Reused window shown (alpha=1, makeKeyWindow)");
                        }
                    }
                });
            });
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = existing.show();
            let _ = existing.set_focus();
        }

        return Ok(());
    }

    // Fallback: create new overlay window (non-macOS or if pre-creation failed)
    eprintln!("[overlay] Creating new overlay window (fallback)");
    use tauri::WebviewWindowBuilder;

    let window = WebviewWindowBuilder::new(app, "overlay", tauri::WebviewUrl::App("/".into()))
        .title("")
        .inner_size(overlay_w, overlay_h)
        .position(0.0, 0.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build()
        .map_err(|e: tauri::Error| AppError::WindowError(e.to_string()))?;

    #[cfg(target_os = "macos")]
    let ns_window_addr = configure_overlay_ns_window(&window);

    // Show after WebView initializes
    #[cfg(target_os = "macos")]
    {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let addr = ns_window_addr;
            let _ = app_handle.run_on_main_thread(move || {
                if addr != 0 {
                    use objc2::msg_send;
                    use objc2::runtime::AnyObject;
                    unsafe {
                        let ns_window = addr as *mut AnyObject;
                        let _: () = msg_send![ns_window, setLevel: 1000_i64];
                        let behavior: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
                        let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
                        let _: () = msg_send![ns_window, setIgnoresMouseEvents: false];
                        let nil: *mut AnyObject = std::ptr::null_mut();
                        let _: () = msg_send![ns_window, makeKeyAndOrderFront: nil];
                        eprintln!("[overlay] New window shown via makeKeyAndOrderFront");
                    }
                }
            });
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let win = window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let _ = win.show();
            let _ = win.set_focus();
        });
    }

    Ok(())
}