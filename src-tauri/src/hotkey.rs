use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_store::StoreExt;

use crate::errors::AppError;
use crate::services::screenshot;
use crate::state::AppState;

/// Timeout for is_capturing state (seconds).
/// If is_capturing has been true for longer than this, it's considered stale
/// (e.g., due to system sleep/wake) and will be automatically reset.
const CAPTURE_TIMEOUT_SECS: u64 = 30;

/// Setup global hotkey on app startup
pub fn setup_hotkey(app: &AppHandle) -> Result<(), AppError> {
    let hotkey_str = get_configured_hotkey(app);
    register_hotkey(app, &hotkey_str)
}

/// Re-register global hotkey after system wake from sleep.
/// This unregisters all existing hotkeys and re-registers the configured one,
/// because OS-level hotkey registrations can become invalid after sleep/wake.
pub fn re_register_hotkey(app: &AppHandle) -> Result<(), AppError> {
    eprintln!("[hotkey] Re-registering hotkey after system wake...");
    let hotkey_str = get_configured_hotkey(app);

    // Unregister all existing hotkeys first (they may be stale)
    if let Err(e) = app.global_shortcut().unregister_all() {
        eprintln!("[hotkey] Warning: failed to unregister old hotkeys: {}", e);
        // Continue anyway - we still want to try registering
    }

    register_hotkey(app, &hotkey_str)?;
    eprintln!("[hotkey] Hotkey '{}' re-registered successfully", hotkey_str);
    Ok(())
}

/// Reset capture state after system wake.
/// Clears any stale is_capturing lock that may have been left from before sleep.
pub fn reset_capture_state(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut is_capturing = state.is_capturing.lock().unwrap();
    if *is_capturing {
        eprintln!("[hotkey] Resetting stale is_capturing state after system wake");
        *is_capturing = false;
        *state.capture_started_at.lock().unwrap() = None;
    }
}

/// Silently restart the entire capture system.
/// This is the ultimate recovery mechanism for any abnormal state,
/// triggered automatically on system wake and available as a manual tray menu option.
///
/// Steps:
/// 1. Reset all capture-related state (is_capturing, is_paused, last_screenshot, capture_started_at)
/// 2. Close/destroy the overlay window if it exists (may be in a broken state)
/// 3. Re-create the overlay window (hidden) for fast subsequent captures
/// 4. Unregister and re-register global hotkeys
///
/// This entire process is silent — no windows are shown, no notifications are sent.
pub fn restart_capture_system(app: &AppHandle) {
    let t0 = std::time::Instant::now();
    eprintln!("[system] Restarting capture system...");

    // Step 1: Reset all capture-related state
    {
        let state = app.state::<AppState>();
        *state.is_capturing.lock().unwrap() = false;
        *state.capture_started_at.lock().unwrap() = None;
        *state.is_paused.lock().unwrap() = false;
        *state.last_screenshot.lock().unwrap() = None;
        eprintln!("[system] State reset complete");
    }

    // Step 2: Destroy the old overlay window (it may be in a broken state after sleep)
    if let Some(overlay) = app.get_webview_window("overlay") {
        eprintln!("[system] Destroying old overlay window...");
        // Try hide first, then destroy
        let _ = overlay.hide();
        let _ = overlay.destroy();
        eprintln!("[system] Old overlay window destroyed");
    }

    // Step 3: Re-create the overlay window (hidden) for fast subsequent captures
    // Only on macOS where we pre-create the overlay for performance
    #[cfg(target_os = "macos")]
    {
        eprintln!("[system] Re-creating overlay window (hidden)...");
        match tauri::WebviewWindowBuilder::new(
            app,
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
            Ok(_) => {
                eprintln!("[system] Overlay window re-created (hidden)");
            }
            Err(e) => {
                eprintln!("[system] Failed to re-create overlay: {} (will create on demand)", e);
            }
        }
    }

    // Step 4: Re-register global hotkey
    if let Err(e) = re_register_hotkey(app) {
        eprintln!("[system] Failed to re-register hotkey: {}", e);
    }

    let elapsed = t0.elapsed();
    eprintln!("[system] Capture system restarted successfully ({:?})", elapsed);
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

    // Prevent duplicate triggers (with timeout protection for sleep/wake scenarios)
    {
        let mut is_capturing = state.is_capturing.lock().unwrap();
        if *is_capturing {
            // Check if the capture has been running for too long (stale state from sleep/wake)
            let is_stale = {
                let capture_time = state.capture_started_at.lock().unwrap();
                match *capture_time {
                    Some(started) => started.elapsed().as_secs() > CAPTURE_TIMEOUT_SECS,
                    None => true, // No timestamp recorded = definitely stale
                }
            };
            if is_stale {
                eprintln!("[hotkey] is_capturing was stale (>{}s or no timestamp), resetting", CAPTURE_TIMEOUT_SECS);
                // Fall through to allow capture
            } else {
                return Ok(());
            }
        }
        *is_capturing = true;
        *state.capture_started_at.lock().unwrap() = Some(std::time::Instant::now());
    }

    // Check if paused
    {
        let is_paused = state.is_paused.lock().unwrap();
        if *is_paused {
            *state.is_capturing.lock().unwrap() = false;
            *state.capture_started_at.lock().unwrap() = None;
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
            *state.capture_started_at.lock().unwrap() = None;
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
            *state.capture_started_at.lock().unwrap() = None;
            crate::services::permission::request_screen_recording_permission();
            return Err(AppError::ScreenRecordingPermissionDenied);
        }
    }

    // Capture screenshot (writes BMP to temp file + JPEG base64 fallback)
    let screenshot_data = match screenshot::capture_current_screen() {
        Ok(data) => data,
        Err(e) => {
            *state.is_capturing.lock().unwrap() = false;
            *state.capture_started_at.lock().unwrap() = None;
            return Err(e);
        }
    };

    let t_capture = t0.elapsed();

    // Store screenshot data
    *state.last_screenshot.lock().unwrap() = Some(screenshot_data.clone());

    // Show overlay window immediately (reuse if exists, create if not)
    show_overlay_window(app, &screenshot_data)?;

    let t_total = t0.elapsed();
    eprintln!("[perf] Total trigger_capture: {:?} (capture: {:?}, window: {:?})",
        t_total, t_capture, t_total - t_capture);

    Ok(())
}

// NOTE: NSWindow properties (level, collectionBehavior) are now set in
// commands::window::show_overlay_window, which is called by the frontend
// after the canvas is ready. This ensures properties are set right before
// the window becomes visible, preventing Space switches.

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

        // Emit event to tell frontend to reload screenshot data
        // Frontend will call show_overlay_window AFTER image is loaded (no flash)
        let _ = app.emit("screenshot-ready", ());

        return Ok(());
    }

    // Create new overlay window (first time or if pre-creation failed)
    // The window is created hidden (visible=false). The frontend will:
    // 1. Detect it's the overlay window via getCurrentWindow().label
    // 2. Fetch screenshot data via get_screenshot command
    // 3. Load the image and draw it onto the canvas
    // 4. Call show_overlay_window command to make it visible
    // This ensures the window is never shown with stale/empty content.
    eprintln!("[overlay] Creating new overlay window (hidden, will show after canvas ready)");
    use tauri::WebviewWindowBuilder;

    let _window = WebviewWindowBuilder::new(app, "overlay", tauri::WebviewUrl::App("/".into()))
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

    // Do NOT show the window here. The frontend will call show_overlay_window
    // after the screenshot is loaded and drawn onto the canvas.
    // This prevents any flash of empty/stale content.

    Ok(())
}
