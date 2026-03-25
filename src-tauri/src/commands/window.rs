use tauri::{AppHandle, Manager};

use crate::errors::AppError;
use crate::state::AppState;

use base64::Engine;

/// Open settings window
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

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
/// screenshot onto the canvas AND ensured a
/// black overlay is covering the window (to prevent stale content flash).
#[tauri::command]
pub async fn show_overlay_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("overlay") {
        #[cfg(target_os = "macos")]
        {
            use objc2::msg_send;
            use objc2::runtime::AnyObject;
            // Set NSWindow level and collectionBehavior BEFORE show().
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
            tokio::task::yield_now().await;
        }
        let _ = window.show();
        #[cfg(not(target_os = "macos"))]
        {
            let _ = window.set_always_on_top(true);
        }
        let _ = window.set_focus();
    }
    Ok(())
}

/// Close overlay window and reset capture state.
///
/// IMPORTANT: The frontend MUST render a black overlay covering the entire window
/// BEFORE calling this command. This ensures macOS caches a black frame (not the
/// old screenshot) when the window is hidden. On next show(), the user sees black
/// instead of the previous screenshot, preventing the stale content flash.
#[tauri::command]
pub async fn close_overlay(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), AppError> {
    *state.is_capturing.lock().unwrap() = false;
    *state.capture_started_at.lock().unwrap() = None;
    *state.last_screenshot.lock().unwrap() = None;

    if let Some(window) = app.get_webview_window("overlay") {
        #[cfg(target_os = "macos")]
        {
            // Hide the window. macOS will cache the current frame (which should be
            // a black overlay, set by the frontend before calling this command).
            let _ = window.hide();

            // Reset window level after hiding to prevent deadlock with system dialogs.
            if let Ok(ptr) = window.ns_window() {
                let ns_window_addr = ptr as usize;
                let app_clone = app.clone();
                let _ = app_clone.run_on_main_thread(move || {
                    if ns_window_addr != 0 {
                        unsafe {
                            use objc2::msg_send;
                            use objc2::runtime::AnyObject;
                            let ns_window = ns_window_addr as *mut AnyObject;
                            let _: () = msg_send![ns_window, setLevel: 0_i64];
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