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

// On macOS, declare Core Graphics functions for display capture.
// CGDisplayCapture prevents macOS from switching Spaces during window creation,
// which is essential for showing overlays above fullscreen apps.
#[cfg(target_os = "macos")]
extern "C" {
    fn CGMainDisplayID() -> u32;
    fn CGDisplayCaptureWithOptions(display: u32, options: u32) -> i32;
    fn CGDisplayRelease(display: u32) -> i32;
    fn CGShieldingWindowLevel() -> i32;
}

fn create_overlay_window(
    app: &AppHandle,
    screenshot: &crate::state::ScreenshotData,
) -> Result<(), AppError> {
    use tauri::WebviewWindowBuilder;

    // Close existing overlay if any
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.close();
    }

    let overlay_w = screenshot.logical_width as f64;
    let overlay_h = screenshot.logical_height as f64;

    // On macOS, capture the display BEFORE creating the window.
    // This prevents macOS from switching Spaces when a new window is created
    // while a fullscreen app is active. kCGCaptureNoFill = 1 means no black fill.
    #[cfg(target_os = "macos")]
    let display_captured = unsafe {
        let display_id = CGMainDisplayID();
        let result = CGDisplayCaptureWithOptions(display_id, 1); // kCGCaptureNoFill
        if result == 0 {
            eprintln!("[overlay] CGDisplayCapture succeeded (display locked, no Space switch)");
            true
        } else {
            eprintln!("[overlay] CGDisplayCapture failed ({}), falling back to normal", result);
            false
        }
    };

    // Create window initially hidden, then show after WebView loads
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

    // On macOS, set the overlay window level and collection behavior
    #[cfg(target_os = "macos")]
    {
        use objc2::msg_send;
        use objc2::runtime::{AnyClass, AnyObject};

        unsafe {
            let cls = AnyClass::get(c"NSApplication").unwrap();
            let ns_app: *mut AnyObject = msg_send![cls, sharedApplication];
            let windows: *mut AnyObject = msg_send![ns_app, windows];
            let count: usize = msg_send![windows, count];

            if count > 0 {
                let overlay_ns_window: *mut AnyObject = msg_send![windows, lastObject];

                if !overlay_ns_window.is_null() {
                    // Use CGShieldingWindowLevel (the level used by display capture)
                    // This is the highest standard level and appears above everything
                    let shield_level = CGShieldingWindowLevel() as i64;
                    let _: () = msg_send![overlay_ns_window, setLevel: shield_level];

                    // NSWindowCollectionBehaviorCanJoinAllSpaces (1 << 0) = 1
                    // NSWindowCollectionBehaviorFullScreenAuxiliary (1 << 8) = 256
                    let behavior: usize = (1 << 0) | (1 << 8);
                    let _: () = msg_send![overlay_ns_window, setCollectionBehavior: behavior];

                    eprintln!("[overlay] Set window level={}, behavior=canJoinAllSpaces|fullScreenAuxiliary", shield_level);
                }
            }
        }
    }

    // Show window after a brief delay to let WebView initialize
    #[cfg(target_os = "macos")]
    {
        // On macOS, use orderFrontRegardless to show without activating the app.
        // Combined with CGDisplayCapture, this keeps the overlay on the current
        // fullscreen Space without switching.
        let app_handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let captured = display_captured;
            let _ = app_handle.run_on_main_thread(move || {
                use objc2::msg_send;
                use objc2::runtime::{AnyClass, AnyObject};

                unsafe {
                    let cls = AnyClass::get(c"NSApplication").unwrap();
                    let ns_app: *mut AnyObject = msg_send![cls, sharedApplication];
                    let windows: *mut AnyObject = msg_send![ns_app, windows];
                    let count: usize = msg_send![windows, count];

                    if count > 0 {
                        let ns_window: *mut AnyObject = msg_send![windows, lastObject];
                        if !ns_window.is_null() {
                            // Show without activating the app
                            let _: () = msg_send![ns_window, orderFrontRegardless];
                            eprintln!("[overlay] Shown via orderFrontRegardless");
                        }
                    }

                    // Release display capture after window is shown
                    if captured {
                        let display_id = CGMainDisplayID();
                        CGDisplayRelease(display_id);
                        eprintln!("[overlay] CGDisplayRelease - display unlocked");
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
