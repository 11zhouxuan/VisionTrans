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
/// screenshot onto the canvas. The window transitions from invisible → visible here.
///
/// On macOS, the overlay window uses alphaValue instead of hide/show to avoid
/// stale content flash. The window is always "visible" to macOS (just transparent
/// when inactive), so WebView rendering updates the compositor buffer continuously.
/// Setting alphaValue=1 makes the current content appear instantly without flash.
#[tauri::command]
pub async fn show_overlay_window(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("overlay") {
        #[cfg(target_os = "macos")]
        {
            use objc2::msg_send;
            use objc2::runtime::AnyObject;

            // First, ensure Tauri's internal state knows the window should be visible.
            // This is needed for the first-time display when window was created with visible=false.
            // For subsequent calls (where we use alphaValue instead of hide), this is a no-op.
            let _ = window.show();

            // Set ALL NSWindow properties in a single run_on_main_thread block.
            // This ensures level, collectionBehavior, mouse events, and alphaValue
            // are all set atomically before the window becomes visible to the user.
            if let Ok(ptr) = window.ns_window() {
                let ns_window_addr = ptr as usize;
                let app_handle = app.clone();
                let _ = app_handle.run_on_main_thread(move || {
                    if ns_window_addr != 0 {
                        unsafe {
                            let ns_window = ns_window_addr as *mut AnyObject;
                            // Set window level for overlay (above all other windows)
                            let _: () = msg_send![ns_window, setLevel: 2000_i64];
                            // Collection behavior for fullscreen Space support
                            let behavior: usize = 1 | 16 | 64 | 256;
                            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
                            // Re-enable mouse events (disabled in close_overlay)
                            let _: () = msg_send![ns_window, setIgnoresMouseEvents: false];
                            // Make window fully opaque — this is the key moment!
                            // The canvas already has the new screenshot drawn on it,
                            // so the user sees the new content immediately.
                            let _: () = msg_send![ns_window, setAlphaValue: 1.0_f64];
                            // Force the window to front and make it key window
                            let _: () = msg_send![ns_window, makeKeyAndOrderFront: std::ptr::null::<AnyObject>()];
                        }
                    }
                });
            }
            // Yield to let run_on_main_thread execute
            tokio::task::yield_now().await;
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = window.show();
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

    // On macOS, make the overlay invisible (for fast reuse on next capture).
    // We use alphaValue=0 + ignoresMouseEvents + move off-screen instead of hide().
    //
    // WHY NOT hide()?
    // macOS Window Server caches the last rendered frame of hidden windows.
    // When show() is called, it displays this cached frame BEFORE the WebView
    // can render new content, causing a flash of the previous screenshot.
    // With alphaValue=0, the window stays "visible" to macOS (just transparent),
    // so WebView rendering continues to update the compositor's buffer.
    // When we later set alphaValue=1, the current content is shown immediately.
    //
    // On other platforms, close it.
    if let Some(window) = app.get_webview_window("overlay") {
        #[cfg(target_os = "macos")]
        {
            if let Ok(ptr) = window.ns_window() {
                let ns_window_addr = ptr as usize;
                let app_clone = app.clone();
                let _ = app_clone.run_on_main_thread(move || {
                    if ns_window_addr != 0 {
                        unsafe {
                            use objc2::msg_send;
                            use objc2::runtime::AnyObject;
                            let ns_window = ns_window_addr as *mut AnyObject;
                            // Make window fully transparent (invisible but still "visible" to macOS)
                            let _: () = msg_send![ns_window, setAlphaValue: 0.0_f64];
                            // Block mouse events so the transparent window doesn't intercept clicks
                            let _: () = msg_send![ns_window, setIgnoresMouseEvents: true];
                            // Reset to normal window level (prevents deadlock with system dialogs)
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
