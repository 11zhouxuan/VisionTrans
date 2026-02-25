use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use uuid::Uuid;

use crate::errors::AppError;

/// WordEntry following the wordbook-format skill specification
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordEntry {
    pub id: String,
    pub word: String,
    pub translation: String,
    pub is_single_word: bool,
    pub starred: bool,
    pub query_count: u32,
    pub page_number: Option<u32>,
    pub source_title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_base64: Option<String>,
}

/// Get the wordbook storage directory
/// If custom_path is provided and non-empty, use it; otherwise default to ~/Documents/VisionTrans-wordbook/
fn get_wordbook_dir(custom_path: &Option<String>) -> Result<PathBuf, AppError> {
    let wordbook_dir = if let Some(path) = custom_path {
        if !path.is_empty() {
            PathBuf::from(path)
        } else {
            default_wordbook_dir()?
        }
    } else {
        default_wordbook_dir()?
    };

    eprintln!("[wordbook] dir: {:?}", wordbook_dir);
    if !wordbook_dir.exists() {
        eprintln!("[wordbook] Creating directory: {:?}", wordbook_dir);
        fs::create_dir_all(&wordbook_dir).map_err(|e| {
            eprintln!("[wordbook] ERROR creating dir: {}", e);
            AppError::Internal(format!("创建单词本目录失败: {}", e))
        })?;
    }
    Ok(wordbook_dir)
}

fn default_wordbook_dir() -> Result<PathBuf, AppError> {
    let doc_dir = dirs::document_dir().ok_or_else(|| {
        eprintln!("[wordbook] ERROR: 无法获取 Documents 目录");
        AppError::Internal("无法获取 Documents 目录".into())
    })?;
    Ok(doc_dir.join("VisionTrans-wordbook"))
}

/// Get the default wordbook path as a string (for frontend display)
pub fn get_default_wordbook_path() -> Result<String, AppError> {
    let dir = default_wordbook_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

/// Save a word entry to the wordbook
/// If the word already exists (case-insensitive), update it instead
pub fn save_word(
    word: &str,
    translation: &str,
    source_language: &str,
    target_language: &str,
    custom_path: &Option<String>,
    image_base64: Option<String>,
) -> Result<WordEntry, AppError> {
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    // Check if word already exists
    let existing = find_word_by_text(word, custom_path)?;

    let entry = if let Some(mut existing) = existing {
        existing.translation = translation.to_string();
        existing.query_count += 1;
        existing.updated_at = now;
        existing.source_title = Some(format!("{} → {}", source_language, target_language));
        if image_base64.is_some() {
            existing.image_base64 = image_base64;
        }
        existing
    } else {
        let is_single_word = !word.trim().contains(' ');
        WordEntry {
            id: Uuid::new_v4().to_string(),
            word: word.trim().to_string(),
            translation: translation.to_string(),
            is_single_word,
            starred: false,
            query_count: 1,
            page_number: None,
            source_title: Some(format!("{} → {}", source_language, target_language)),
            created_at: now.clone(),
            updated_at: now,
            image_base64,
        }
    };

    write_word_file(&entry, custom_path)?;
    Ok(entry)
}

/// Write a word entry to its JSON file and append to meta.jsonl
fn write_word_file(entry: &WordEntry, custom_path: &Option<String>) -> Result<(), AppError> {
    let dir = get_wordbook_dir(custom_path)?;

    let file_path = dir.join(format!("{}.json", entry.id));
    let json = serde_json::to_string_pretty(entry)
        .map_err(|e| AppError::Internal(format!("序列化单词数据失败: {}", e)))?;
    fs::write(&file_path, &json)
        .map_err(|e| AppError::Internal(format!("写入单词文件失败: {}", e)))?;

    let jsonl_path = dir.join("meta.jsonl");
    let compact_json = serde_json::to_string(entry)
        .map_err(|e| AppError::Internal(format!("序列化单词数据失败: {}", e)))?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&jsonl_path)
        .map_err(|e| AppError::Internal(format!("打开 meta.jsonl 失败: {}", e)))?;
    writeln!(file, "{}", compact_json)
        .map_err(|e| AppError::Internal(format!("写入 meta.jsonl 失败: {}", e)))?;

    Ok(())
}

/// Find a word by its text (case-insensitive)
fn find_word_by_text(word_text: &str, custom_path: &Option<String>) -> Result<Option<WordEntry>, AppError> {
    let all_words = get_all_words(custom_path)?;
    Ok(all_words
        .into_iter()
        .find(|w| w.word.to_lowercase() == word_text.to_lowercase()))
}

/// Read all word entries from the wordbook directory
pub fn get_all_words(custom_path: &Option<String>) -> Result<Vec<WordEntry>, AppError> {
    let dir = get_wordbook_dir(custom_path)?;
    let mut words = Vec::new();

    let entries = fs::read_dir(&dir)
        .map_err(|e| AppError::Internal(format!("读取单词本目录失败: {}", e)))?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if Uuid::parse_str(stem).is_err() {
            continue;
        }

        match fs::read_to_string(&path) {
            Ok(content) => {
                match serde_json::from_str::<WordEntry>(&content) {
                    Ok(word) => words.push(word),
                    Err(_) => continue,
                }
            }
            Err(_) => continue,
        }
    }

    words.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(words)
}

/// Toggle the starred status of a word
pub fn toggle_star(id: &str, custom_path: &Option<String>) -> Result<WordEntry, AppError> {
    let dir = get_wordbook_dir(custom_path)?;
    let file_path = dir.join(format!("{}.json", id));

    if !file_path.exists() {
        return Err(AppError::Internal("单词不存在".into()));
    }

    let content = fs::read_to_string(&file_path)
        .map_err(|e| AppError::Internal(format!("读取单词文件失败: {}", e)))?;
    let mut entry: WordEntry = serde_json::from_str(&content)
        .map_err(|e| AppError::Internal(format!("解析单词数据失败: {}", e)))?;

    entry.starred = !entry.starred;
    entry.updated_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    write_word_file(&entry, custom_path)?;
    Ok(entry)
}

/// Delete a word entry
pub fn delete_word(id: &str, custom_path: &Option<String>) -> Result<(), AppError> {
    let dir = get_wordbook_dir(custom_path)?;
    let file_path = dir.join(format!("{}.json", id));

    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| AppError::Internal(format!("删除单词文件失败: {}", e)))?;
    }

    Ok(())
}
