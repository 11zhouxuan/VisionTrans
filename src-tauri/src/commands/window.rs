use tauri::{AppHandle, Manager};

use crate::errors::AppError;
use crate::state::AppState;

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

/// Show overlay window (called by frontend after screenshot is loaded)
#[tauri::command]
pub async fn show_overlay_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("overlay") {
        let _ = window.show();
        let _ = window.set_always_on_top(true);
        #[cfg(target_os = "macos")]
        {
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
            let _ = window.hide();
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = window.close();
        }
    }

    Ok(())
}
