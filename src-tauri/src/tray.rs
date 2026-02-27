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
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSApplication;
        use objc2_foundation::MainThreadMarker;
        if let Some(mtm) = MainThreadMarker::new() {
            let ns_app = NSApplication::sharedApplication(mtm);
            ns_app.activateIgnoringOtherApps(true);
        }
    }

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
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSApplication;
        use objc2_foundation::MainThreadMarker;
        if let Some(mtm) = MainThreadMarker::new() {
            let ns_app = NSApplication::sharedApplication(mtm);
            ns_app.activateIgnoringOtherApps(true);
        }
    }

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

        // Force NSImage.setTemplate(false) to preserve original icon colors
        // Tauri may set template=true even when iconAsTemplate=false in config
        #[cfg(target_os = "macos")]
        {
            use objc2::msg_send;
            use objc2::runtime::{AnyClass, AnyObject};

            unsafe {
                let status_bar_cls = match AnyClass::get(c"NSStatusBar") {
                    Some(cls) => cls,
                    None => {
                        eprintln!("[tray] NSStatusBar class not found");
                        return Ok(());
                    }
                };
                let status_bar: *mut AnyObject = msg_send![status_bar_cls, systemStatusBar];
                if status_bar.is_null() {
                    eprintln!("[tray] systemStatusBar is null");
                    return Ok(());
                }

                let items: *mut AnyObject = msg_send![status_bar, statusItems];
                if items.is_null() {
                    eprintln!("[tray] statusItems is null");
                    return Ok(());
                }

                let count: usize = msg_send![items, count];
                for i in 0..count {
                    let item: *mut AnyObject = msg_send![items, objectAtIndex: i];
                    if item.is_null() { continue; }
                    let button: *mut AnyObject = msg_send![item, button];
                    if button.is_null() { continue; }
                    let image: *mut AnyObject = msg_send![button, image];
                    if image.is_null() { continue; }
                    // setTemplate: takes BOOL (i8 on macOS), pass 0 for NO
                    let _: () = msg_send![image, setTemplate: false];
                }
                eprintln!("[tray] Set NSImage.setTemplate(false) on {} status items", count);
            }
        }
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
