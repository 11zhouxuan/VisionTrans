use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::errors::AppError;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct LLMConfig {
    pub provider: String, // "openai" or "bedrock"
    // OpenAI-compatible
    pub api_key: String,
    pub endpoint: String,
    pub model: String,
    // Bedrock
    pub bedrock_api_key: String,
    pub bedrock_model_id: String,
    pub bedrock_region: String,
    // Common
    pub target_language: String,
    pub proxy: Option<ProxyConfig>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ProxyConfig {
    pub protocol: String,
    pub url: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct TranslateResult {
    pub translation: String,
    #[serde(rename = "sourceLanguage")]
    pub source_language: String,
    #[serde(rename = "targetLanguage")]
    pub target_language: String,
}

// ===== OpenAI types =====
#[derive(Serialize)]
struct OpenAIChatRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    max_tokens: u32,
}

#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: Vec<OpenAIContentPart>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum OpenAIContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrlDetail },
}

#[derive(Serialize)]
struct ImageUrlDetail {
    url: String,
    detail: String,
}

#[derive(Deserialize, Debug)]
struct OpenAIChatResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Deserialize, Debug)]
struct OpenAIChoice {
    message: OpenAIResponseMessage,
}

#[derive(Deserialize, Debug)]
struct OpenAIResponseMessage {
    content: String,
}

// ===== Bedrock types =====
#[derive(Serialize)]
struct BedrockRequest {
    system: Vec<BedrockTextBlock>,
    messages: Vec<BedrockMessage>,
    #[serde(rename = "inferenceConfig")]
    inference_config: BedrockInferenceConfig,
}

#[derive(Serialize)]
struct BedrockTextBlock {
    text: String,
}

#[derive(Serialize)]
struct BedrockMessage {
    role: String,
    content: Vec<BedrockContentPart>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum BedrockContentPart {
    Text { text: String },
    Image { image: BedrockImageBlock },
}

#[derive(Serialize)]
struct BedrockImageBlock {
    format: String,
    source: BedrockImageSource,
}

#[derive(Serialize)]
struct BedrockImageSource {
    bytes: String,
}

#[derive(Serialize)]
struct BedrockInferenceConfig {
    #[serde(rename = "maxTokens")]
    max_tokens: u32,
    temperature: f32,
}

#[derive(Deserialize, Debug)]
struct BedrockResponse {
    output: Option<BedrockOutput>,
}

#[derive(Deserialize, Debug)]
struct BedrockOutput {
    message: Option<BedrockResponseMessage>,
}

#[derive(Deserialize, Debug)]
struct BedrockResponseMessage {
    content: Vec<BedrockResponseContent>,
}

#[derive(Deserialize, Debug)]
struct BedrockResponseContent {
    text: Option<String>,
}

// ===== Unified dispatcher =====

/// Call LLM API for translation - dispatches to correct provider
pub async fn translate(
    config: &LLMConfig,
    image_base64: &str,
) -> Result<TranslateResult, AppError> {
    let target_lang_name = match config.target_language.as_str() {
        "zh" => "中文",
        "en" => "English",
        _ => "中文",
    };

    let prompt = format!(
        "识别图片中被高亮标记的文本内容，结合整体图像的上下文语境，\
         将其翻译为{}。直接输出翻译结果，保持原意和专业词汇的准确性。\
         如果图片中没有可识别的文本，请回复\"未检测到需要翻译的文本\"。",
        target_lang_name
    );

    let translation = match config.provider.as_str() {
        "bedrock" => call_bedrock(config, &prompt, image_base64).await?,
        _ => call_openai(config, &prompt, image_base64).await?,
    };

    Ok(TranslateResult {
        translation,
        source_language: "AUTO".to_string(),
        target_language: target_lang_name.to_string(),
    })
}

/// Test API connection - dispatches to correct provider
pub async fn test_connection(config: &LLMConfig) -> Result<bool, AppError> {
    match config.provider.as_str() {
        "bedrock" => test_bedrock(config).await,
        _ => test_openai(config).await,
    }
}

// ===== OpenAI implementation =====

async fn call_openai(
    config: &LLMConfig,
    prompt: &str,
    image_base64: &str,
) -> Result<String, AppError> {
    let client = build_http_client(&config.proxy)?;

    let request = OpenAIChatRequest {
        model: config.model.clone(),
        messages: vec![OpenAIMessage {
            role: "user".into(),
            content: vec![
                OpenAIContentPart::Text {
                    text: prompt.to_string(),
                },
                OpenAIContentPart::ImageUrl {
                    image_url: ImageUrlDetail {
                        url: format!("data:image/png;base64,{}", image_base64),
                        detail: "high".into(),
                    },
                },
            ],
        }],
        max_tokens: 1024,
    };

    let endpoint = normalize_endpoint(&config.endpoint);
    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(AppError::from_reqwest)?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::ApiAuthError);
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(AppError::RateLimitExceeded);
    }
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(AppError::LLMResponseError(format!(
            "HTTP {}: {}",
            status, error_text
        )));
    }

    let chat_response: OpenAIChatResponse = response
        .json()
        .await
        .map_err(|e| AppError::LLMResponseError(e.to_string()))?;

    Ok(chat_response
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .unwrap_or_else(|| "未检测到需要翻译的文本".to_string()))
}

async fn test_openai(config: &LLMConfig) -> Result<bool, AppError> {
    let client = build_http_client(&config.proxy)?;

    let request = OpenAIChatRequest {
        model: config.model.clone(),
        messages: vec![OpenAIMessage {
            role: "user".into(),
            content: vec![OpenAIContentPart::Text {
                text: "Hello, respond with 'ok'.".to_string(),
            }],
        }],
        max_tokens: 10,
    };

    let endpoint = normalize_endpoint(&config.endpoint);
    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(AppError::from_reqwest)?;

    Ok(response.status().is_success())
}

// ===== Bedrock implementation =====

async fn call_bedrock(
    config: &LLMConfig,
    prompt: &str,
    image_base64: &str,
) -> Result<String, AppError> {
    let client = build_http_client(&config.proxy)?;

    let request = BedrockRequest {
        system: vec![BedrockTextBlock {
            text: "You are a professional translator. Follow the user's instructions precisely."
                .to_string(),
        }],
        messages: vec![BedrockMessage {
            role: "user".into(),
            content: vec![
                BedrockContentPart::Text {
                    text: prompt.to_string(),
                },
                BedrockContentPart::Image {
                    image: BedrockImageBlock {
                        format: "png".to_string(),
                        source: BedrockImageSource {
                            bytes: image_base64.to_string(),
                        },
                    },
                },
            ],
        }],
        inference_config: BedrockInferenceConfig {
            max_tokens: 4096,
            temperature: 0.1,
        },
    };

    let url = format!(
        "https://bedrock-runtime.{}.amazonaws.com/model/{}/converse",
        config.bedrock_region,
        urlencoding::encode(&config.bedrock_model_id)
    );

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.bedrock_api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(AppError::from_reqwest)?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(AppError::ApiAuthError);
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(AppError::RateLimitExceeded);
    }
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(AppError::LLMResponseError(format!(
            "Bedrock HTTP {}: {}",
            status, error_text
        )));
    }

    let bedrock_response: BedrockResponse = response
        .json()
        .await
        .map_err(|e| AppError::LLMResponseError(e.to_string()))?;

    let translation = bedrock_response
        .output
        .and_then(|o| o.message)
        .map(|m| {
            m.content
                .iter()
                .filter_map(|c| c.text.clone())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_else(|| "未检测到需要翻译的文本".to_string());

    Ok(translation)
}

async fn test_bedrock(config: &LLMConfig) -> Result<bool, AppError> {
    let client = build_http_client(&config.proxy)?;

    let request = BedrockRequest {
        system: vec![BedrockTextBlock {
            text: "You are a helpful assistant.".to_string(),
        }],
        messages: vec![BedrockMessage {
            role: "user".into(),
            content: vec![BedrockContentPart::Text {
                text: "Say hello and confirm you are working. Reply in one short sentence."
                    .to_string(),
            }],
        }],
        inference_config: BedrockInferenceConfig {
            max_tokens: 50,
            temperature: 0.1,
        },
    };

    let url = format!(
        "https://bedrock-runtime.{}.amazonaws.com/model/{}/converse",
        config.bedrock_region,
        urlencoding::encode(&config.bedrock_model_id)
    );

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.bedrock_api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(AppError::from_reqwest)?;

    Ok(response.status().is_success())
}

// ===== Helpers =====

fn normalize_endpoint(endpoint: &str) -> String {
    let url = endpoint.trim_end_matches('/');
    if url.ends_with("/chat/completions") {
        url.to_string()
    } else {
        format!("{}/chat/completions", url)
    }
}

fn build_http_client(proxy_config: &Option<ProxyConfig>) -> Result<reqwest::Client, AppError> {
    let mut builder = reqwest::Client::builder();

    if let Some(proxy) = proxy_config {
        let proxy_url = reqwest::Proxy::all(&proxy.url)
            .map_err(|e| AppError::Internal(format!("Invalid proxy URL: {}", e)))?;
        builder = builder.proxy(proxy_url);
    }

    builder
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to build HTTP client: {}", e)))
}
