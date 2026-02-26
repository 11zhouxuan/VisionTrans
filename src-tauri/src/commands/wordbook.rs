use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::errors::AppError;
use crate::services::wordbook::{self, WordEntry};

/// Read wordbook path from config store
fn read_wordbook_path(app: &AppHandle) -> Option<String> {
    let store = app.store("config.json").ok()?;
    store
        .get("wordbookPath")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
}

/// Get the default wordbook path
#[tauri::command]
pub async fn get_default_wordbook_path() -> Result<String, AppError> {
    wordbook::get_default_wordbook_path()
}

/// Save a word to the wordbook
#[tauri::command]
pub async fn save_word_to_wordbook(
    app: AppHandle,
    word: String,
    translation: String,
    word_type: String,
    source_language: String,
    target_language: String,
    image_base64: Option<String>,
) -> Result<WordEntry, AppError> {
    let custom_path = read_wordbook_path(&app);
    eprintln!("[wordbook-cmd] save_word_to_wordbook called");
    eprintln!("[wordbook-cmd]   word: {:?}, type: {}", &word[..word.len().min(50)], &word_type);
    eprintln!("[wordbook-cmd]   has_image: {}", image_base64.is_some());
    let result = wordbook::save_word(&word, &translation, &word_type, &source_language, &target_language, &custom_path, image_base64);
    match &result {
        Ok(entry) => eprintln!("[wordbook-cmd] save OK: id={}", entry.id),
        Err(e) => eprintln!("[wordbook-cmd] save ERROR: {}", e),
    }
    result
}

/// Get all words from the wordbook
#[tauri::command]
pub async fn get_all_words(app: AppHandle) -> Result<Vec<WordEntry>, AppError> {
    let custom_path = read_wordbook_path(&app);
    eprintln!("[wordbook-cmd] get_all_words called, path: {:?}", custom_path);
    let result = wordbook::get_all_words(&custom_path);
    match &result {
        Ok(words) => eprintln!("[wordbook-cmd] get_all_words OK: {} words", words.len()),
        Err(e) => eprintln!("[wordbook-cmd] get_all_words ERROR: {}", e),
    }
    result
}

/// Toggle star status of a word
#[tauri::command]
pub async fn toggle_star_word(app: AppHandle, id: String) -> Result<WordEntry, AppError> {
    let custom_path = read_wordbook_path(&app);
    wordbook::toggle_star(&id, &custom_path)
}

/// Delete a word from the wordbook
#[tauri::command]
pub async fn delete_word_from_wordbook(app: AppHandle, id: String) -> Result<(), AppError> {
    let custom_path = read_wordbook_path(&app);
    wordbook::delete_word(&id, &custom_path)
}

/// Open the wordbook window
#[tauri::command]
pub async fn open_wordbook_window(app: AppHandle) -> Result<(), AppError> {
    crate::tray::open_wordbook_public(&app);
    Ok(())
}

/// Open the wordbook folder in system file manager
#[tauri::command]
pub async fn open_wordbook_folder(path: String) -> Result<(), AppError> {
    eprintln!("[wordbook-cmd] open_wordbook_folder: {}", path);
    let path = std::path::Path::new(&path);
    if path.exists() {
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(path)
                .spawn()
                .map_err(|e| AppError::Internal(format!("打开文件夹失败: {}", e)))?;
        }
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(path)
                .spawn()
                .map_err(|e| AppError::Internal(format!("打开文件夹失败: {}", e)))?;
        }
    } else {
        return Err(AppError::Internal(format!("路径不存在: {}", path.display())));
    }
    Ok(())
}
