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

            // Try tauri-plugin-notification first
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

            // Also use osascript as a reliable fallback on macOS
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
            // Request permission
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

    // Create overlay window
    create_overlay_window(app, &screenshot_data)?;

    Ok(())
}

/// Configure NSWindow properties for fullscreen overlay on macOS.
/// Returns the NSWindow address as usize for thread-safe passing.
#[cfg(target_os = "macos")]
fn configure_ns_window(window: &tauri::WebviewWindow) -> usize {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject};

    match window.ns_window() {
        Ok(ptr) => {
            let ns_window = ptr as *mut AnyObject;
            unsafe {
                // Log the class of the object to verify it's actually an NSWindow
                let cls: *mut AnyObject = msg_send![ns_window, class];
                let cls_name: *mut AnyObject = msg_send![cls, description];
                let cls_str: *const std::ffi::c_char = msg_send![cls_name, UTF8String];
                let class_name = if !cls_str.is_null() {
                    std::ffi::CStr::from_ptr(cls_str).to_string_lossy().to_string()
                } else {
                    "unknown".to_string()
                };
                eprintln!("[overlay] ns_window() returned object of class: {}", class_name);

                // Read current values before setting
                let current_level: i64 = msg_send![ns_window, level];
                let current_behavior: usize = msg_send![ns_window, collectionBehavior];
                eprintln!("[overlay] BEFORE: level={}, behavior={}", current_level, current_behavior);

                // 1. Set window level to screenSaver (1000)
                let _: () = msg_send![ns_window, setLevel: 1000_i64];

                // 2. Set collection behavior:
                //    canJoinAllSpaces (1) | stationary (16) | ignoresCycle (64) | fullScreenAuxiliary (256)
                let behavior: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
                let _: () = msg_send![ns_window, setCollectionBehavior: behavior];

                // 3. Ensure window receives mouse events (not click-through)
                let _: () = msg_send![ns_window, setIgnoresMouseEvents: false];

                // Verify values were set
                let new_level: i64 = msg_send![ns_window, level];
                let new_behavior: usize = msg_send![ns_window, collectionBehavior];
                eprintln!("[overlay] AFTER: level={}, behavior={}", new_level, new_behavior);

                // Also check if window is on a specific space
                let is_visible: bool = msg_send![ns_window, isVisible];
                let is_key: bool = msg_send![ns_window, isKeyWindow];
                eprintln!("[overlay] isVisible={}, isKeyWindow={}", is_visible, is_key);
            }
            ptr as usize
        }
        Err(e) => {
            eprintln!("[overlay] Failed to get ns_window: {}", e);
            0
        }
    }
}

fn create_overlay_window(
    app: &AppHandle,
    screenshot: &crate::state::ScreenshotData,
) -> Result<(), AppError> {
    let overlay_w = screenshot.logical_width as f64;
    let overlay_h = screenshot.logical_height as f64;

    // Close existing overlay if any (always create fresh for correct screenshot)
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.close();
    }

    // First time: create the overlay window
    eprintln!("[overlay] Creating new overlay window");
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

    // Configure NSWindow properties immediately after creation
    #[cfg(target_os = "macos")]
    let ns_window_addr = configure_ns_window(&window);

    // Show window after a brief delay to let WebView initialize
    #[cfg(target_os = "macos")]
    {
        // On macOS, use native makeKeyAndOrderFront: via run_on_main_thread.
        // Do NOT use Tauri's show()/set_focus() - they cause click-through issues.
        let app_handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let addr = ns_window_addr;
            let _ = app_handle.run_on_main_thread(move || {
                if addr != 0 {
                    use objc2::msg_send;
                    use objc2::runtime::{AnyObject, Bool};
                    unsafe {
                        let ns_window = addr as *mut AnyObject;
                        // Re-apply all properties
                        let _: () = msg_send![ns_window, setLevel: 1000_i64];
                        let behavior: usize = (1 << 0) | (1 << 4) | (1 << 6) | (1 << 8);
                        let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
                        let _: () = msg_send![ns_window, setIgnoresMouseEvents: false];

                        // Show window via makeKeyAndOrderFront (confirmed to fix transparency)
                        let nil: *mut AnyObject = std::ptr::null_mut();
                        let _: () = msg_send![ns_window, makeKeyAndOrderFront: nil];

                        eprintln!("[overlay] Shown via makeKeyAndOrderFront on main thread");
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
