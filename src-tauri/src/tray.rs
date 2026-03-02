use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconId,
    AppHandle, Manager,
};

use crate::state::AppState;

/// Open settings window directly (synchronous, for use in tray callbacks and reopen events)
pub fn open_settings_public(app: &AppHandle) {
    open_settings(app);
}

/// Open wordbook window directly (synchronous, for use in tray callbacks)
pub fn open_wordbook_public(app: &AppHandle) {
    open_wordbook(app);
}

fn open_settings(app: &AppHandle) {
    // NOTE: Do NOT call activateIgnoringOtherApps - it causes Space switching.
    // With ActivationPolicy::Accessory, show() + set_focus() is sufficient.

    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    match tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App("/".into()),
    )
    .title("VisionTrans 设置")
    .inner_size(500.0, 600.0)
    .center()
    .resizable(true)
    .build()
    {
        Ok(w) => {
            let _ = w.set_focus();
        }
        Err(e) => eprintln!("Failed to create settings window: {}", e),
    }
}

fn open_wordbook(app: &AppHandle) {
    // NOTE: Do NOT call activateIgnoringOtherApps - it causes Space switching.

    if let Some(window) = app.get_webview_window("wordbook") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    match tauri::WebviewWindowBuilder::new(
        app,
        "wordbook",
        tauri::WebviewUrl::App("/".into()),
    )
    .title("VisionTrans 单词本")
    .inner_size(900.0, 700.0)
    .center()
    .resizable(true)
    .build()
    {
        Ok(w) => {
            let _ = w.set_focus();
        }
        Err(e) => eprintln!("Failed to create wordbook window: {}", e),
    }
}

/// Setup system tray menu on the tray icon created by tauri.conf.json
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let capture_item = MenuItem::with_id(app, "capture", "截图翻译", true, None::<&str>)?;
    let wordbook_item = MenuItem::with_id(app, "wordbook", "单词本", true, None::<&str>)?;
    let settings_item = MenuItem::with_id(app, "settings", "打开设置", true, None::<&str>)?;
    let pause_item = MenuItem::with_id(app, "pause", "暂停监听", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出 VisionTrans", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&capture_item, &wordbook_item, &settings_item, &pause_item, &quit_item])?;

    // Get the tray icon created by tauri.conf.json (id: "main-tray")
    let tray_id = TrayIconId::new("main-tray");
    if let Some(tray) = app.tray_by_id(&tray_id) {
        tray.set_menu(Some(menu))?;
        tray.on_menu_event(move |app, event| match event.id.as_ref() {
            "capture" => {
                let _ = crate::hotkey::trigger_capture(app);
            }
            "wordbook" => {
                open_wordbook(app);
            }
            "settings" => {
                open_settings(app);
            }
            "pause" => {
                let state = app.state::<AppState>();
                let mut is_paused = state.is_paused.lock().unwrap();
                *is_paused = !*is_paused;
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        });
        tray.set_tooltip(Some("VisionTrans - AI 视觉翻译"))?;

        // Note: Tauri sets NSImage.isTemplate=true on macOS tray icons.
        // The iconAsTemplate=false config should handle this, but if colors
        // are still tinted, a runtime fix via NSStatusBar API would be needed.
        // Currently disabled due to crash issues with NSStatusBar.statusItems.
    } else {
        eprintln!("Warning: Tray icon 'main-tray' not found, creating new one");
        // Fallback: create a new tray icon
        let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;
        let _tray = tauri::tray::TrayIconBuilder::new()
            .icon(icon)
            .menu(&menu)
            .tooltip("VisionTrans")
            .on_menu_event(move |app, event| match event.id.as_ref() {
                "settings" => {
                    open_settings(app);
                }
                "pause" => {
                    let state = app.state::<AppState>();
                    let mut is_paused = state.is_paused.lock().unwrap();
                    *is_paused = !*is_paused;
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            })
            .build(app)?;
    }

    Ok(())
}
