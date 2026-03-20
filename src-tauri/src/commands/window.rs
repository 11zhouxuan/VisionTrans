use tauri::{AppHandle, Manager};

use crate::errors::AppError;
use crate::state::AppState;

use base64::Engine;

/// Open settings window
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), AppError> {
    // NOTE: Do NOT call activateIgnoringOtherApps here.
    // It causes macOS to switch Spaces when a fullscreen app is active.
    // With ActivationPolicy::Accessory, show() + set_focus() is sufficient.

    // Check if settings window already exists
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    // Create new settings window
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        "settings",
        tauri::WebviewUrl::App("/".into()),
    )
    .title("VisionTrans 设置")
    .inner_size(500.0, 700.0)
    .center()
    .resizable(true)
    .build()
    .map_err(|e| {
        eprintln!("Failed to create settings window: {}", e);
        AppError::WindowError(e.to_string())
    })?;

    Ok(())
}

/// Show overlay window (called by frontend after screenshot is loaded onto canvas)
///
/// CRITICAL: This must only be called AFTER the frontend has fully rendered the
/// screenshot onto the canvas. The window transitions from hidden → visible here,
/// so any stale content would flash if the canvas isn't ready.
#[tauri::command]
pub async fn show_overlay_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("overlay") {
        #[cfg(target_os = "macos")]
        {
            use objc2::msg_send;
            use objc2::runtime::AnyObject;
            // CRITICAL: Set NSWindow level and collectionBehavior BEFORE show().
            // If we show() first with level=0, macOS may trigger a Space switch
            // (e.g., when VSCode is fullscreen, the overlay would appear on the
            // desktop Space instead of over the fullscreen app).
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
            // Small yield to let run_on_main_thread execute before show()
            tokio::task::yield_now().await;
        }
        // Now show the window - NSWindow properties are already set
        let _ = window.show();
        // Don't call set_always_on_top() - it may reset NSWindow properties.
        // We already set level=2000 via native API above.
        #[cfg(not(target_os = "macos"))]
        {
            let _ = window.set_always_on_top(true);
        }
        let _ = window.set_focus();
    }
    Ok(())
}

/// Close overlay window and reset capture state
#[tauri::command]
pub async fn close_overlay(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    // Reset capturing state
    *state.is_capturing.lock().unwrap() = false;

    // Clear screenshot data
    *state.last_screenshot.lock().unwrap() = None;

    // On macOS, hide the overlay (for fast reuse on next capture).
    // On other platforms, close it.
    if let Some(window) = app.get_webview_window("overlay") {
        #[cfg(target_os = "macos")]
        {
            // Hide the window FIRST so it disappears immediately.
            // Then reset the window level to prevent deadlock scenarios where
            // a hidden high-level window blocks system dialogs.
            let _ = window.hide();

            // Reset window level AFTER hiding.
            // The window is already invisible, so level=0 won't cause a Space switch.
            // On next show, show_overlay_window will set level=2000 BEFORE show().
            //
            // NOTE: We only reset the window LEVEL, not collectionBehavior.
            // collectionBehavior includes canJoinAllSpaces which must persist
            // so the window can appear on fullscreen Spaces when reused.
            if let Ok(ptr) = window.ns_window() {
                let ns_window_addr = ptr as usize;
                let app_clone = app.clone();
                let _ = app_clone.run_on_main_thread(move || {
                    if ns_window_addr != 0 {
                        unsafe {
                            use objc2::msg_send;
                            use objc2::runtime::AnyObject;
                            let ns_window = ns_window_addr as *mut AnyObject;
                            // Reset to normal window level (prevents deadlock)
                            let _: () = msg_send![ns_window, setLevel: 0_i64];
                            // DO NOT reset collectionBehavior — keep canJoinAllSpaces
                            // so the window works correctly on fullscreen Spaces
                        }
                    }
                });
            }
            let _ = window.set_always_on_top(false);
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = window.close();
        }
    }

    Ok(())
}

/// Save screenshot image to ~/Downloads/ directory
#[tauri::command]
pub async fn save_screenshot(image_base64: String) -> Result<String, AppError> {
    let download_dir = dirs::download_dir().unwrap_or_else(|| {
        dirs::home_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
            .join("Downloads")
    });

    // Ensure directory exists
    if !download_dir.exists() {
        std::fs::create_dir_all(&download_dir).map_err(|e| {
            AppError::IoError(format!("Failed to create Downloads directory: {}", e))
        })?;
    }

    let filename = format!("visiontrans-{}.png", chrono::Local::now().format("%Y%m%d-%H%M%S"));
    let filepath = download_dir.join(&filename);

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&image_base64)
        .map_err(|e| AppError::IoError(format!("Failed to decode base64: {}", e)))?;

    std::fs::write(&filepath, &bytes)
        .map_err(|e| AppError::IoError(format!("Failed to write file: {}", e)))?;

    Ok(filepath.to_string_lossy().to_string())
}
