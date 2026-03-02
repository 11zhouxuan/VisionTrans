use tauri::{AppHandle, Manager};

use crate::errors::AppError;
use crate::state::AppState;

/// Open settings window
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), AppError> {
    // On macOS with LSUIElement, we need to activate the app to show windows
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSApplication;
        use objc2_foundation::MainThreadMarker;
        if let Some(mtm) = MainThreadMarker::new() {
            let ns_app = NSApplication::sharedApplication(mtm);
            #[allow(deprecated)]
            ns_app.activateIgnoringOtherApps(true);
        }
    }

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

    // On macOS, make the overlay invisible (alpha=0) instead of hiding/closing.
    // hide() calls orderOut: which removes the window from all Spaces.
    // Using alpha=0 keeps the window on all Spaces (canJoinAllSpaces) so it
    // can be shown on the fullscreen Space without switching.
    if let Some(window) = app.get_webview_window("overlay") {
        #[cfg(target_os = "macos")]
        {
            use objc2::msg_send;
            use objc2::runtime::AnyObject;
            if let Ok(ptr) = window.ns_window() {
                unsafe {
                    let ns_window = ptr as *mut AnyObject;
                    // Make invisible but keep on all Spaces
                    let _: () = msg_send![ns_window, setAlphaValue: 0.0_f64];
                    // Move off-screen as extra measure
                    let _: () = msg_send![ns_window, setIgnoresMouseEvents: true];
                    eprintln!("[overlay] Made invisible (alpha=0) for reuse on all Spaces");
                }
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = window.close();
        }
    }

    Ok(())
}
