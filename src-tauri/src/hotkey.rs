use tauri::{AppHandle, Emitter, Manager};
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
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| AppError::Internal(format!("Failed to unregister hotkeys: {}", e)))?;
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
    let t0 = std::time::Instant::now();
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

    // Check concurrency limit
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
            let _ = app.notification()
                .builder()
                .title("VisionTrans")
                .body(format!("当前已有 {} 个翻译任务进行中，请等待完成后再试", active_count))
                .show();
            #[cfg(target_os = "macos")]
            {
                let msg = format!("当前已有 {} 个翻译任务进行中，请等待完成后再试", active_count);
                let _ = std::process::Command::new("osascript")
                    .args(["-e", &format!("display notification \"{}\" with title \"VisionTrans\"", msg)])
                    .spawn();
            }
            return Ok(());
        }
    }

    #[cfg(target_os = "macos")]
    {
        if !crate::services::permission::check_screen_recording_permission() {
            *state.is_capturing.lock().unwrap() = false;
            crate::services::permission::request_screen_recording_permission();
            return Err(AppError::ScreenRecordingPermissionDenied);
        }
    }

    // Capture screenshot (writes to temp file)
    let screenshot_data = match screenshot::capture_current_screen() {
        Ok(data) => data,
        Err(e) => {
            *state.is_capturing.lock().unwrap() = false;
            return Err(e);
        }
    };

    let t_capture = t0.elapsed();

    // Store screenshot data
    *state.last_screenshot.lock().unwrap() = Some(screenshot_data.clone());

    // Show overlay window (reuse if exists, create if not)
    show_overlay_window(app, &screenshot_data)?;

    let t_total = t0.elapsed();
    eprintln!("[perf] Total trigger_capture: {:?} (capture: {:?}, window: {:?})",
        t_total, t_capture, t_total - t_capture);

    Ok(())
}

/// Set native NSWindow properties for fullscreen overlay on macOS.
#[cfg(target_os = "macos")]
fn set_overlay_ns_window_props(app: &AppHandle, window: &tauri::WebviewWindow) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    if let Ok(ptr) = window.ns_window() {
        let ns_window_addr = ptr as usize;
        let app_handle = app.clone();
        let _ = app_handle.run_on_main_thread(move || {
            if ns_window_addr != 0 {
                unsafe {
                    let ns_window = ns_window_addr as *mut AnyObject;
                    let _: () = msg_send![ns_window, setLevel: 2000_i64];
                    let behavior: usize = 1 | 16 | 64 | 256;
                    let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
                    let _: () = msg_send![ns_window, setIgnoresMouseEvents: false];
                }
            }
        });
    }
}

fn show_overlay_window(
    app: &AppHandle,
    screenshot: &crate::state::ScreenshotData,
) -> Result<(), AppError> {
    let overlay_w = screenshot.logical_width as f64;
    let overlay_h = screenshot.logical_height as f64;

    // Try to reuse existing overlay window (pre-created or from previous capture)
    if let Some(existing) = app.get_webview_window("overlay") {
        eprintln!("[overlay] Reusing existing overlay window");

        // Resize to match current screen
        let _ = existing.set_size(tauri::LogicalSize::new(overlay_w, overlay_h));
        let _ = existing.set_position(tauri::LogicalPosition::new(0.0, 0.0));

        // Emit event to tell frontend to reload screenshot
        let _ = app.emit("screenshot-ready", serde_json::json!({
            "filePath": screenshot.file_path
        }));

        // Show and configure
        let _ = existing.show();
        let _ = existing.set_always_on_top(true);
        #[cfg(target_os = "macos")]
        set_overlay_ns_window_props(app, &existing);
        let _ = existing.set_focus();

        return Ok(());
    }

    // Create new overlay window (first time or if pre-creation failed)
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

    // Show immediately
    let _ = window.show();
    let _ = window.set_always_on_top(true);
    #[cfg(target_os = "macos")]
    set_overlay_ns_window_props(app, &window);
    let _ = window.set_focus();

    Ok(())
}