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

    // Create window initially hidden, then show after WebView loads
    // This prevents the "flash/bounce" effect
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

    // On macOS, set the overlay window to appear above fullscreen apps
    // We need:
    //   1. High window level (NSScreenSaverWindowLevel = 1000) to appear above fullscreen apps
    //   2. NSWindowCollectionBehaviorCanJoinAllSpaces so it shows on all Spaces
    //   3. NSWindowCollectionBehaviorFullScreenAuxiliary so it can coexist with fullscreen windows
    #[cfg(target_os = "macos")]
    {
        use objc2::msg_send;
        use objc2::runtime::{AnyClass, AnyObject};

        unsafe {
            let cls = AnyClass::get(c"NSApplication").unwrap();
            let ns_app: *mut AnyObject = msg_send![cls, sharedApplication];
            let windows: *mut AnyObject = msg_send![ns_app, windows];
            let count: usize = msg_send![windows, count];

            // Find the overlay window by matching frame size (most reliable)
            let mut overlay_ns_window: *mut AnyObject = std::ptr::null_mut();
            for i in (0..count).rev() {
                let w: *mut AnyObject = msg_send![windows, objectAtIndex: i];
                if w.is_null() { continue; }

                // Get the window's frame
                // NSRect is { origin: { x, y }, size: { width, height } }
                #[repr(C)]
                #[derive(Debug)]
                struct NSRect { x: f64, y: f64, w: f64, h: f64 }
                let frame: NSRect = msg_send![w, frame];

                // Match by size (the overlay window matches the screen dimensions)
                if (frame.w - overlay_w).abs() < 2.0 && (frame.h - overlay_h).abs() < 2.0 {
                    overlay_ns_window = w;
                    eprintln!("[overlay] Found NSWindow by frame match: {}x{}", frame.w, frame.h);
                    break;
                }
            }

            if overlay_ns_window.is_null() {
                // Fallback: use the last window (most recently created)
                if count > 0 {
                    overlay_ns_window = msg_send![windows, lastObject];
                    eprintln!("[overlay] Fallback: using lastObject as overlay window");
                }
            }

            if !overlay_ns_window.is_null() {
                // Set window level to NSScreenSaverWindowLevel (1000)
                // This is high enough to appear above fullscreen apps
                let _: () = msg_send![overlay_ns_window, setLevel: 1000_i64];

                // NSWindowCollectionBehaviorCanJoinAllSpaces (1 << 0) = 1
                // NSWindowCollectionBehaviorMoveToActiveSpace (1 << 1) = 2
                // NSWindowCollectionBehaviorFullScreenAuxiliary (1 << 8) = 256
                let behavior: usize = (1 << 0) | (1 << 1) | (1 << 8);
                let _: () = msg_send![overlay_ns_window, setCollectionBehavior: behavior];

                eprintln!("[overlay] Set window level=1000, behavior=canJoinAllSpaces|moveToActiveSpace|fullScreenAuxiliary");
            }
        }
    }

    // Show window after a brief delay to let WebView initialize
    let win = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let _ = win.show();
        let _ = win.set_focus();
    });

    Ok(())
}
