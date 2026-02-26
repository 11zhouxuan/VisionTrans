use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;

use crate::errors::AppError;
use crate::services::llm_client::{self, LLMConfig, ProxyConfig};
use crate::state::{AppState, Position, TranslationRequest};

/// Read max concurrency from config (default 1)
fn get_max_concurrency(app: &AppHandle) -> usize {
    app.store("config.json")
        .ok()
        .and_then(|s| s.get("maxConcurrency"))
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(1)
        .max(1) // minimum 1
}

/// Start translation with cropped image
#[tauri::command]
pub async fn start_translation(
    app: AppHandle,
    state: State<'_, AppState>,
    image_base64: String,
    position: Position,
) -> Result<(), AppError> {
    // Store the request for retry
    *state.last_translation_request.lock().unwrap() = Some(TranslationRequest {
        image_base64: image_base64.clone(),
        position: position.clone(),
    });

    // Reset capturing state
    *state.is_capturing.lock().unwrap() = false;

    // Clear screenshot data to free memory
    *state.last_screenshot.lock().unwrap() = None;

    // Check concurrency limit and allocate a window slot
    let max_concurrency = get_max_concurrency(&app);
    let window_id = state.allocate_result_window(max_concurrency)
        .ok_or_else(|| AppError::Internal(format!(
            "已达到最大并发翻译数 ({})，请等待当前翻译完成后再试",
            max_concurrency
        )))?;

    // Create result window with unique ID and offset position
    let slot_index = state.active_count() - 1; // 0-based index for positioning
    create_result_window(&app, &window_id, slot_index)?;

    // Read config from store
    let config = read_llm_config(&app)?;

    // Check API key based on provider
    let has_key = match config.provider.as_str() {
        "bedrock" => !config.bedrock_api_key.is_empty(),
        _ => !config.api_key.is_empty(),
    };

    if !has_key {
        // Release concurrency slot immediately since no translation will happen
        state.release_result_window(&window_id);
        let _ = app.emit_to(
            window_id.as_str(),
            "translation-error",
            serde_json::json!({
                "code": "API_KEY_NOT_CONFIGURED",
                "message": "API Key 未配置，请先在设置中配置 API Key",
                "action": "settings"
            }),
        );
        return Ok(());
    }

    // Call LLM API in background
    let app_handle = app.clone();
    let win_id = window_id.clone();
    tauri::async_runtime::spawn(async move {
        let result = llm_client::translate(&config, &image_base64).await;

        // Release the concurrency slot as soon as translation completes (success or error)
        // The result window stays open for the user to read, but the slot is freed
        {
            let state = app_handle.state::<AppState>();
            state.release_result_window(&win_id);
            eprintln!("[translate] Translation done, released concurrency slot: {} (active: {})", &win_id, state.active_count());
        }

        match result {
            Ok(mut result) => {
                eprintln!("[llm] Translation result for {}:\n{}", &win_id, &result.translation);
                // Check if saveScreenshot is enabled, attach image to result
                let save_screenshot = app_handle.store("config.json")
                    .ok()
                    .and_then(|s| s.get("saveScreenshot"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(true);
                if save_screenshot {
                    result.image_base64 = Some(image_base64.clone());
                }
                let _ = app_handle.emit_to(win_id.as_str(), "translation-result", result);
            }
            Err(err) => {
                let (code, action) = match &err {
                    AppError::ApiKeyNotConfigured => {
                        ("API_KEY_NOT_CONFIGURED", Some("settings"))
                    }
                    AppError::ApiAuthError => ("API_AUTH_ERROR", Some("settings")),
                    AppError::NetworkTimeout => ("NETWORK_TIMEOUT", Some("retry")),
                    AppError::NetworkUnavailable => ("NETWORK_UNAVAILABLE", Some("retry")),
                    AppError::RateLimitExceeded => ("RATE_LIMIT", Some("retry")),
                    _ => ("UNKNOWN", Some("retry")),
                };
                let _ = app_handle.emit_to(
                    win_id.as_str(),
                    "translation-error",
                    serde_json::json!({
                        "code": code,
                        "message": err.to_string(),
                        "action": action
                    }),
                );
            }
        }
    });

    Ok(())
}

/// Retry the last translation (retries in the calling window)
#[tauri::command]
pub async fn retry_translation(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let request = state
        .last_translation_request
        .lock()
        .unwrap()
        .clone()
        .ok_or(AppError::Internal("无翻译请求数据".into()))?;

    let config = read_llm_config(&app)?;

    // Retry emits to all result windows (the calling window will pick it up)
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        match llm_client::translate(&config, &request.image_base64).await {
            Ok(result) => {
                // Emit to all windows - the one that called retry will receive it
                let _ = app_handle.emit("translation-result", result);
            }
            Err(err) => {
                let _ = app_handle.emit(
                    "translation-error",
                    serde_json::json!({
                        "code": "RETRY_FAILED",
                        "message": err.to_string(),
                        "action": "retry"
                    }),
                );
            }
        }
    });

    Ok(())
}

/// Release a result window slot when the window is closed
#[tauri::command]
pub async fn release_result_slot(
    state: State<'_, AppState>,
    window_id: String,
) -> Result<(), AppError> {
    state.release_result_window(&window_id);
    eprintln!("[translate] Released result slot: {} (active: {})", window_id, state.active_count());
    Ok(())
}

/// Test API connection - reads config from store
#[tauri::command]
pub async fn test_api_connection(app: AppHandle) -> Result<bool, AppError> {
    let config = read_llm_config(&app)?;
    llm_client::test_connection(&config).await
}

fn read_llm_config(app: &AppHandle) -> Result<LLMConfig, AppError> {
    let store = app
        .store("config.json")
        .map_err(|e| AppError::ConfigError(e.to_string()))?;

    let provider = store
        .get("provider")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "openai".to_string());

    let api_key = store
        .get("apiKey")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    let endpoint = store
        .get("endpoint")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string());

    let model = store
        .get("model")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "gpt-4o".to_string());

    let bedrock_api_key = store
        .get("bedrockApiKey")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    let bedrock_model_id = store
        .get("bedrockModelId")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "us.anthropic.claude-sonnet-4-5-20250929-v1:0".to_string());

    let bedrock_region = store
        .get("bedrockRegion")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "us-east-1".to_string());

    let target_language = store
        .get("targetLanguage")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "zh".to_string());

    let proxy = store.get("proxy").and_then(|v| {
        let protocol = v.get("protocol")?.as_str()?.to_string();
        let url = v.get("url")?.as_str()?.to_string();
        Some(ProxyConfig { protocol, url })
    });

    Ok(LLMConfig {
        provider,
        api_key,
        endpoint,
        model,
        bedrock_api_key,
        bedrock_model_id,
        bedrock_region,
        target_language,
        proxy,
    })
}

fn create_result_window(app: &AppHandle, window_id: &str, slot_index: usize) -> Result<(), AppError> {
    use tauri::WebviewWindowBuilder;

    let card_width = 400.0;
    let card_height = 120.0;

    // Offset each window to avoid overlap: cascade down-right
    let base_x = 80.0;
    let base_y = 64.0;
    let offset_per_slot = 36.0;
    let x = base_x + (slot_index as f64) * offset_per_slot;
    let y = base_y + (slot_index as f64) * offset_per_slot;

    // Close existing window with same ID if any
    if let Some(window) = app.get_webview_window(window_id) {
        let _ = window.close();
    }

    let mut builder = WebviewWindowBuilder::new(app, window_id, tauri::WebviewUrl::App("/".into()))
        .title("")
        .inner_size(card_width, card_height)
        .position(x, y)
        .closable(false)
        .minimizable(false)
        .maximizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false);

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }

    #[cfg(target_os = "windows")]
    {
        builder = builder.decorations(false);
    }

    let _window = builder
        .build()
        .map_err(|e: tauri::Error| AppError::WindowError(e.to_string()))?;

    Ok(())
}