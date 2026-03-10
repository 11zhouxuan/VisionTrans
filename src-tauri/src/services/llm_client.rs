use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

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
    pub enable_stream: bool,
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
    /// The cropped image that was sent for translation (optional, for saving to wordbook)
    #[serde(rename = "imageBase64", skip_serializing_if = "Option::is_none")]
    pub image_base64: Option<String>,
}

// ===== OpenAI types =====
#[derive(Serialize)]
struct OpenAIChatRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
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

/// Call LLM API for translation - dispatches to correct provider (non-streaming)
pub async fn translate(
    config: &LLMConfig,
    image_base64: &str,
) -> Result<TranslateResult, AppError> {
    let target_lang_name = match config.target_language.as_str() {
        "zh" => "简体中文",
        "en" => "English",
        _ => "简体中文",
    };

    let prompt = build_prompt(target_lang_name);

    let translation = match config.provider.as_str() {
        "bedrock" => call_bedrock(config, &prompt, image_base64).await?,
        _ => call_openai(config, &prompt, image_base64).await?,
    };

    // Extract source language from LLM XML response
    let source_language = extract_source_language(&translation).unwrap_or_else(|| "AUTO".to_string());

    Ok(TranslateResult {
        translation,
        source_language,
        target_language: target_lang_name.to_string(),
        image_base64: None,
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
        stream: None,
    };

    let endpoint = normalize_endpoint(&config.endpoint);
    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .timeout(Duration::from_secs(120))
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
        stream: None,
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
        .timeout(Duration::from_secs(120))
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

// ===== OpenAI SSE streaming types =====

#[derive(Deserialize, Debug)]
struct OpenAIStreamChunk {
    choices: Vec<OpenAIStreamChoice>,
}

#[derive(Deserialize, Debug)]
struct OpenAIStreamChoice {
    delta: OpenAIStreamDelta,
}

#[derive(Deserialize, Debug)]
struct OpenAIStreamDelta {
    content: Option<String>,
}

// ===== XML Streaming State Machine =====

/// Tracks which XML tag we're currently inside for streaming field events
#[derive(Debug, Clone, PartialEq)]
enum XmlStreamState {
    /// Before <result> - waiting for content to start
    Init,
    /// Inside <thinking>...</thinking>
    Thinking,
    /// Saw </thinking>, waiting for <source-language>
    AfterThinking,
    /// Inside <source-language>
    SourceLanguage,
    /// Inside <translation>, processing fields
    InTranslation,
    /// Inside a specific field tag (e.g. <source>, <phonetic>, <context>, etc.)
    InField(String),
    /// Inside a container tag that has children (e.g. <definitions>, <examples>, <grammar>, <vocabulary>)
    InContainer(String),
    /// Inside a child element of a container (e.g. <def>, <example>, <pattern>, <word>)
    InContainerChild(String, String),
    /// Inside a leaf within a container child (e.g. <en> or <target> inside <example>)
    InContainerLeaf(String, String, String),
    /// Inside <item> in multi mode
    InItem,
    /// Inside a field within an <item>
    InItemField(String),
    /// Inside a container within an <item>
    InItemContainer(String),
    /// Inside a child of a container within an <item>
    InItemContainerChild(String, String),
    /// Inside a leaf within a container child within an <item>
    InItemContainerLeaf(String, String, String),
    /// Done - saw </result>
    Done,
}

/// Emitter helper that sends events to a specific window
struct StreamEmitter {
    app: AppHandle,
    window_id: String,
}

impl StreamEmitter {
    fn new(app: AppHandle, window_id: String) -> Self {
        Self { app, window_id }
    }

    fn emit(&self, event_type: &str, payload: serde_json::Value) {
        // Log for debugging (before move)
        if event_type != "field-delta" {
            eprintln!("[stream] {} -> {}: {:?}", self.window_id, event_type, payload);
        }
        let _ = self.app.emit_to(
            self.window_id.as_str(),
            "translation-stream",
            payload,
        );
    }

    fn thinking(&self) {
        self.emit("thinking", serde_json::json!({"type": "thinking"}));
    }

    fn rendering(&self, translation_type: &str, source_language: &str, target_language: &str) {
        self.emit("rendering", serde_json::json!({
            "type": "rendering",
            "translationType": translation_type,
            "sourceLanguage": source_language,
            "targetLanguage": target_language,
        }));
    }

    fn field_start(&self, field: &str, attrs: Option<serde_json::Value>) {
        let mut payload = serde_json::json!({"type": "field-start", "field": field});
        if let Some(a) = attrs {
            payload["attrs"] = a;
        }
        self.emit("field-start", payload);
    }

    fn field_delta(&self, field: &str, text: &str) {
        self.emit("field-delta", serde_json::json!({
            "type": "field-delta",
            "field": field,
            "text": text,
        }));
    }

    fn field_end(&self, field: &str) {
        self.emit("field-end", serde_json::json!({"type": "field-end", "field": field}));
    }

    fn item_start(&self) {
        self.emit("item-start", serde_json::json!({"type": "item-start"}));
    }

    fn item_end(&self) {
        self.emit("item-end", serde_json::json!({"type": "item-end"}));
    }

    fn complete(&self, full_xml: &str) {
        self.emit("complete", serde_json::json!({"type": "complete", "fullXml": full_xml}));
    }

    #[allow(dead_code)]
    fn error(&self, message: &str) {
        self.emit("error", serde_json::json!({"type": "error", "message": message}));
    }
}

/// Process streaming XML content and emit field-level events
struct XmlStreamProcessor {
    emitter: StreamEmitter,
    state: XmlStreamState,
    buffer: String,
    full_xml: String,
    translation_type: String,
    source_language: String,
    target_language: String,
    sent_thinking: bool,
    sent_rendering: bool,
}

impl XmlStreamProcessor {
    fn new(emitter: StreamEmitter, target_language: String) -> Self {
        Self {
            emitter,
            state: XmlStreamState::Init,
            buffer: String::new(),
            full_xml: String::new(),
            translation_type: String::new(),
            source_language: String::new(),
            target_language,
            sent_thinking: false,
            sent_rendering: false,
        }
    }

    /// Feed a chunk of text from SSE and process it
    fn feed(&mut self, chunk: &str) {
        self.full_xml.push_str(chunk);
        self.buffer.push_str(chunk);
        self.process_buffer();
    }

    fn process_buffer(&mut self) {
        // Process the buffer looking for complete tags and text content
        let mut iterations = 0;
        loop {
            iterations += 1;
            if iterations > 500 {
                eprintln!("[xml-sm] Too many iterations, breaking. State: {:?}, buffer len: {}", self.state, self.buffer.len());
                break;
            }
            match self.state.clone() {
                XmlStreamState::Init => {
                    // Look for <thinking> or <result>
                    if let Some(pos) = self.buffer.find("<thinking>") {
                        self.buffer = self.buffer[pos + "<thinking>".len()..].to_string();
                        self.state = XmlStreamState::Thinking;
                        if !self.sent_thinking {
                            self.emitter.thinking();
                            self.sent_thinking = true;
                        }
                    } else if let Some(pos) = self.buffer.find("<result>") {
                        self.buffer = self.buffer[pos + "<result>".len()..].to_string();
                        // Stay in Init, will look for <thinking> next
                    } else {
                        break;
                    }
                }
                XmlStreamState::Thinking => {
                    if let Some(pos) = self.buffer.find("</thinking>") {
                        self.buffer = self.buffer[pos + "</thinking>".len()..].to_string();
                        self.state = XmlStreamState::AfterThinking;
                    } else {
                        break;
                    }
                }
                XmlStreamState::AfterThinking => {
                    if let Some(pos) = self.buffer.find("<source-language>") {
                        self.buffer = self.buffer[pos + "<source-language>".len()..].to_string();
                        self.state = XmlStreamState::SourceLanguage;
                    } else if let Some(_pos) = self.buffer.find("<translation") {
                        // No source-language tag, go directly to translation
                        self.try_enter_translation();
                    } else {
                        break;
                    }
                }
                XmlStreamState::SourceLanguage => {
                    if let Some(pos) = self.buffer.find("</source-language>") {
                        self.source_language = self.buffer[..pos].trim().to_string();
                        self.buffer = self.buffer[pos + "</source-language>".len()..].to_string();
                        // Transition to AfterThinking which will look for <translation>
                        // Don't call try_enter_translation() directly because the closing >
                        // might not have arrived yet in the buffer
                        self.state = XmlStreamState::AfterThinking;
                    } else {
                        break;
                    }
                }
                XmlStreamState::InTranslation => {
                    // Try to open fields FIRST, then check for closing tag.
                    // This ensures fields are processed even when the entire
                    // XML is already in the buffer.
                    if self.translation_type == "multi" {
                        if let Some(pos) = self.buffer.find("<item>") {
                            self.buffer = self.buffer[pos + "<item>".len()..].to_string();
                            self.state = XmlStreamState::InItem;
                            self.emitter.item_start();
                        } else if self.buffer.contains("</translation>") {
                            if let Some(pos) = self.buffer.find("</translation>") {
                                self.buffer = self.buffer[pos + "</translation>".len()..].to_string();
                                self.state = XmlStreamState::Done;
                            }
                        } else {
                            break;
                        }
                    } else if self.try_open_field(false) {
                        // Successfully opened a field, continue loop
                    } else if let Some(pos) = self.buffer.find("</translation>") {
                        // No more fields to open, check for closing tag
                        self.buffer = self.buffer[pos + "</translation>".len()..].to_string();
                        self.state = XmlStreamState::Done;
                    } else {
                        break;
                    }
                }
                XmlStreamState::InField(ref field) => {
                    let close_tag = format!("</{}>", field);
                    if let Some(pos) = self.buffer.find(&close_tag) {
                        let text = self.buffer[..pos].to_string();
                        if !text.is_empty() {
                            self.emitter.field_delta(&field, &text);
                        }
                        self.emitter.field_end(&field);
                        self.buffer = self.buffer[pos + close_tag.len()..].to_string();
                        self.state = XmlStreamState::InTranslation;
                    } else {
                        // Emit what we have as delta, keep last 50 chars as potential partial tag
                        let field = field.clone();
                        self.emit_buffered_delta(&field, 50);
                        break;
                    }
                }
                XmlStreamState::InContainer(ref container) => {
                    let container = container.clone();
                    let close_tag = format!("</{}>", container);
                    if let Some(pos) = self.buffer.find(&close_tag) {
                        self.emitter.field_end(&container);
                        self.buffer = self.buffer[pos + close_tag.len()..].to_string();
                        self.state = XmlStreamState::InTranslation;
                    } else {
                        // Look for child elements
                        self.try_open_container_child(&container, false);
                        break;
                    }
                }
                XmlStreamState::InContainerChild(ref container, ref child) => {
                    let container = container.clone();
                    let child = child.clone();
                    let close_tag = format!("</{}>", child);
                    if let Some(pos) = self.buffer.find(&close_tag) {
                        let text = self.buffer[..pos].to_string();
                        if !text.is_empty() {
                            let compound = format!("{}.{}", container, child);
                            self.emitter.field_delta(&compound, &text);
                        }
                        let compound = format!("{}.{}", container, child);
                        self.emitter.field_end(&compound);
                        self.buffer = self.buffer[pos + close_tag.len()..].to_string();
                        self.state = XmlStreamState::InContainer(container);
                    } else {
                        // Check for leaf elements inside the child (e.g. <en>, <target> inside <example>)
                        self.try_open_container_leaf(&container, &child, false);
                        break;
                    }
                }
                XmlStreamState::InContainerLeaf(ref container, ref child, ref leaf) => {
                    let container = container.clone();
                    let child = child.clone();
                    let leaf = leaf.clone();
                    let close_tag = format!("</{}>", leaf);
                    if let Some(pos) = self.buffer.find(&close_tag) {
                        let text = self.buffer[..pos].to_string();
                        if !text.is_empty() {
                            let compound = format!("{}.{}.{}", container, child, leaf);
                            self.emitter.field_delta(&compound, &text);
                        }
                        let compound = format!("{}.{}.{}", container, child, leaf);
                        self.emitter.field_end(&compound);
                        self.buffer = self.buffer[pos + close_tag.len()..].to_string();
                        self.state = XmlStreamState::InContainerChild(container, child);
                    } else {
                        let compound = format!("{}.{}.{}", container, child, leaf);
                        self.emit_buffered_delta(&compound, 50);
                        break;
                    }
                }
                XmlStreamState::InItem => {
                    // Try to open fields FIRST, then check for </item>
                    if self.try_open_field(true) {
                        // Successfully opened a field, continue loop
                    } else if let Some(pos) = self.buffer.find("</item>") {
                        self.buffer = self.buffer[pos + "</item>".len()..].to_string();
                        self.emitter.item_end();
                        self.state = XmlStreamState::InTranslation;
                    } else {
                        break;
                    }
                }
                XmlStreamState::InItemField(ref field) => {
                    let close_tag = format!("</{}>", field);
                    if let Some(pos) = self.buffer.find(&close_tag) {
                        let text = self.buffer[..pos].to_string();
                        if !text.is_empty() {
                            self.emitter.field_delta(&field, &text);
                        }
                        self.emitter.field_end(&field);
                        self.buffer = self.buffer[pos + close_tag.len()..].to_string();
                        self.state = XmlStreamState::InItem;
                    } else {
                        let field = field.clone();
                        self.emit_buffered_delta(&field, 50);
                        break;
                    }
                }
                XmlStreamState::InItemContainer(ref container) => {
                    let container = container.clone();
                    let close_tag = format!("</{}>", container);
                    if let Some(pos) = self.buffer.find(&close_tag) {
                        self.emitter.field_end(&container);
                        self.buffer = self.buffer[pos + close_tag.len()..].to_string();
                        self.state = XmlStreamState::InItem;
                    } else {
                        self.try_open_container_child(&container, true);
                        break;
                    }
                }
                XmlStreamState::InItemContainerChild(ref container, ref child) => {
                    let container = container.clone();
                    let child = child.clone();
                    let close_tag = format!("</{}>", child);
                    if let Some(pos) = self.buffer.find(&close_tag) {
                        let text = self.buffer[..pos].to_string();
                        if !text.is_empty() {
                            let compound = format!("{}.{}", container, child);
                            self.emitter.field_delta(&compound, &text);
                        }
                        let compound = format!("{}.{}", container, child);
                        self.emitter.field_end(&compound);
                        self.buffer = self.buffer[pos + close_tag.len()..].to_string();
                        self.state = XmlStreamState::InItemContainer(container);
                    } else {
                        self.try_open_container_leaf(&container, &child, true);
                        break;
                    }
                }
                XmlStreamState::InItemContainerLeaf(ref container, ref child, ref leaf) => {
                    let container = container.clone();
                    let child = child.clone();
                    let leaf = leaf.clone();
                    let close_tag = format!("</{}>", leaf);
                    if let Some(pos) = self.buffer.find(&close_tag) {
                        let text = self.buffer[..pos].to_string();
                        if !text.is_empty() {
                            let compound = format!("{}.{}.{}", container, child, leaf);
                            self.emitter.field_delta(&compound, &text);
                        }
                        let compound = format!("{}.{}.{}", container, child, leaf);
                        self.emitter.field_end(&compound);
                        self.buffer = self.buffer[pos + close_tag.len()..].to_string();
                        self.state = XmlStreamState::InItemContainerChild(container, child);
                    } else {
                        let compound = format!("{}.{}.{}", container, child, leaf);
                        self.emit_buffered_delta(&compound, 50);
                        break;
                    }
                }
                XmlStreamState::Done => {
                    break;
                }
            }
        }
    }

    /// Try to enter <translation type="..."> tag
    fn try_enter_translation(&mut self) {
        // Look for <translation type="word"> etc.
        if let Some(start) = self.buffer.find("<translation") {
            if let Some(end) = self.buffer[start..].find('>') {
                let tag = &self.buffer[start..start + end + 1];
                // Extract type attribute
                if let Some(type_start) = tag.find("type=\"") {
                    let after = &tag[type_start + 6..];
                    if let Some(type_end) = after.find('"') {
                        self.translation_type = after[..type_end].to_string();
                    }
                }
                self.buffer = self.buffer[start + end + 1..].to_string();
                self.state = XmlStreamState::InTranslation;

                if !self.sent_rendering {
                    self.emitter.rendering(
                        &self.translation_type,
                        &self.source_language,
                        &self.target_language,
                    );
                    self.sent_rendering = true;
                }
            }
        }
    }

    /// Container tags that have child elements
    fn is_container_tag(tag: &str) -> bool {
        matches!(tag, "definitions" | "examples" | "grammar" | "vocabulary")
    }

    /// Known child tags for each container
    fn child_tag_for_container(container: &str) -> &'static str {
        match container {
            "definitions" => "def",
            "examples" => "example",
            "grammar" => "pattern",
            "vocabulary" => "word",
            _ => "",
        }
    }

    /// Known leaf tags inside container children
    fn leaf_tags_for_child(child: &str) -> &'static [&'static str] {
        match child {
            "example" => &["en", "target"],
            _ => &[],
        }
    }

    /// Try to open a field tag. Returns true if progress was made.
    fn try_open_field(&mut self, in_item: bool) -> bool {
        // Find the next '<' that starts a tag
        if let Some(tag_start) = self.buffer.find('<') {
            // Make sure it's not a closing tag
            if self.buffer[tag_start..].starts_with("</") {
                return false;
            }
            // Find the end of the tag
            if let Some(tag_end) = self.buffer[tag_start..].find('>') {
                let full_tag = &self.buffer[tag_start..tag_start + tag_end + 1];
                // Extract tag name (handle attributes like <def pos="n">)
                let tag_inner = &full_tag[1..full_tag.len() - 1]; // strip < >
                let tag_name = tag_inner.split_whitespace().next().unwrap_or("").to_string();

                if tag_name.is_empty() || tag_name.starts_with('/') {
                    return false;
                }

                // Extract attributes
                let attrs = self.extract_attrs(tag_inner);

                if Self::is_container_tag(&tag_name) {
                    self.emitter.field_start(&tag_name, attrs);
                    self.buffer = self.buffer[tag_start + tag_end + 1..].to_string();
                    self.state = if in_item {
                        XmlStreamState::InItemContainer(tag_name)
                    } else {
                        XmlStreamState::InContainer(tag_name)
                    };
                } else {
                    self.emitter.field_start(&tag_name, attrs);
                    self.buffer = self.buffer[tag_start + tag_end + 1..].to_string();
                    self.state = if in_item {
                        XmlStreamState::InItemField(tag_name)
                    } else {
                        XmlStreamState::InField(tag_name)
                    };
                }
                return true;
            }
        }
        false
    }

    /// Try to open a child element inside a container
    fn try_open_container_child(&mut self, container: &str, in_item: bool) {
        let expected_child = Self::child_tag_for_container(container);
        if expected_child.is_empty() {
            return;
        }
        let open_tag_prefix = format!("<{}", expected_child);
        if let Some(tag_start) = self.buffer.find(&open_tag_prefix) {
            if let Some(tag_end) = self.buffer[tag_start..].find('>') {
                let full_tag = &self.buffer[tag_start..tag_start + tag_end + 1];
                let tag_inner = &full_tag[1..full_tag.len() - 1];
                let attrs = self.extract_attrs(tag_inner);
                let compound = format!("{}.{}", container, expected_child);
                self.emitter.field_start(&compound, attrs);
                self.buffer = self.buffer[tag_start + tag_end + 1..].to_string();
                self.state = if in_item {
                    XmlStreamState::InItemContainerChild(container.to_string(), expected_child.to_string())
                } else {
                    XmlStreamState::InContainerChild(container.to_string(), expected_child.to_string())
                };
            }
        }
    }

    /// Try to open a leaf element inside a container child
    fn try_open_container_leaf(&mut self, container: &str, child: &str, in_item: bool) {
        let leaves = Self::leaf_tags_for_child(child);
        for leaf in leaves {
            let open_tag = format!("<{}>", leaf);
            if let Some(pos) = self.buffer.find(&open_tag) {
                let compound = format!("{}.{}.{}", container, child, leaf);
                self.emitter.field_start(&compound, None);
                self.buffer = self.buffer[pos + open_tag.len()..].to_string();
                self.state = if in_item {
                    XmlStreamState::InItemContainerLeaf(container.to_string(), child.to_string(), leaf.to_string())
                } else {
                    XmlStreamState::InContainerLeaf(container.to_string(), child.to_string(), leaf.to_string())
                };
                return;
            }
        }
    }

    /// Extract attributes from a tag inner string like `def pos="n"`
    fn extract_attrs(&self, tag_inner: &str) -> Option<serde_json::Value> {
        let mut attrs = serde_json::Map::new();
        // Simple attribute parser: find key="value" pairs
        let parts: Vec<&str> = tag_inner.splitn(2, char::is_whitespace).collect();
        if parts.len() < 2 {
            return None;
        }
        let attr_str = parts[1];
        let mut remaining = attr_str;
        while let Some(eq_pos) = remaining.find('=') {
            let key = remaining[..eq_pos].trim();
            remaining = &remaining[eq_pos + 1..];
            if remaining.starts_with('"') {
                remaining = &remaining[1..];
                if let Some(end_quote) = remaining.find('"') {
                    let value = &remaining[..end_quote];
                    attrs.insert(key.to_string(), serde_json::Value::String(value.to_string()));
                    remaining = &remaining[end_quote + 1..];
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        if attrs.is_empty() {
            None
        } else {
            Some(serde_json::Value::Object(attrs))
        }
    }

    /// Emit buffered text as delta, keeping `keep` bytes as potential partial tag
    fn emit_buffered_delta(&mut self, field: &str, keep: usize) {
        if self.buffer.len() > keep {
            let emit_len = self.buffer.len() - keep;
            // Don't split in the middle of a potential tag
            let safe_len = if let Some(lt_pos) = self.buffer[..emit_len].rfind('<') {
                lt_pos
            } else {
                emit_len
            };
            if safe_len > 0 {
                let text = self.buffer[..safe_len].to_string();
                self.emitter.field_delta(field, &text);
                self.buffer = self.buffer[safe_len..].to_string();
            }
        }
    }

    /// Finalize - flush any remaining buffer and emit complete
    fn finalize(&mut self) {
        self.emitter.complete(&self.full_xml);
    }
}

/// Streaming translation - sends events to frontend as content arrives
pub async fn translate_stream(
    config: &LLMConfig,
    image_base64: &str,
    app: &AppHandle,
    window_id: &str,
) -> Result<String, AppError> {
    let target_lang_name = match config.target_language.as_str() {
        "zh" => "简体中文",
        "en" => "English",
        _ => "简体中文",
    };

    let prompt = build_prompt(target_lang_name);

    let emitter = StreamEmitter::new(app.clone(), window_id.to_string());

    match config.provider.as_str() {
        "bedrock" => {
            call_bedrock_stream(config, &prompt, image_base64, emitter, target_lang_name).await
        }
        _ => {
            call_openai_stream(config, &prompt, image_base64, emitter, target_lang_name).await
        }
    }
}

/// OpenAI streaming implementation
async fn call_openai_stream(
    config: &LLMConfig,
    prompt: &str,
    image_base64: &str,
    emitter: StreamEmitter,
    target_lang_name: &str,
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
        max_tokens: 4096,
        stream: Some(true),
    };

    let endpoint = normalize_endpoint(&config.endpoint);
    let response = client
        .post(&endpoint)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .timeout(Duration::from_secs(180))
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

    let mut processor = XmlStreamProcessor::new(emitter, target_lang_name.to_string());
    let mut byte_stream = response.bytes_stream();
    let mut sse_buffer = String::new();

    while let Some(chunk_result) = byte_stream.next().await {
        let chunk = chunk_result.map_err(|e| AppError::LLMResponseError(format!("Stream error: {}", e)))?;
        let chunk_str = String::from_utf8_lossy(&chunk);
        sse_buffer.push_str(&chunk_str);

        // Process complete SSE lines
        while let Some(line_end) = sse_buffer.find('\n') {
            let line = sse_buffer[..line_end].trim_end_matches('\r').to_string();
            sse_buffer = sse_buffer[line_end + 1..].to_string();

            if line.starts_with("data: ") {
                let data = &line[6..];
                if data == "[DONE]" {
                    break;
                }
                if let Ok(chunk) = serde_json::from_str::<OpenAIStreamChunk>(data) {
                    if let Some(choice) = chunk.choices.first() {
                        if let Some(content) = &choice.delta.content {
                            processor.feed(content);
                        }
                    }
                }
            }
        }
    }

    processor.finalize();
    Ok(processor.full_xml)
}

/// Bedrock converse-stream implementation
async fn call_bedrock_stream(
    config: &LLMConfig,
    prompt: &str,
    image_base64: &str,
    emitter: StreamEmitter,
    target_lang_name: &str,
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

    // Use converse-stream endpoint for streaming
    let url = format!(
        "https://bedrock-runtime.{}.amazonaws.com/model/{}/converse-stream",
        config.bedrock_region,
        urlencoding::encode(&config.bedrock_model_id)
    );

    eprintln!("[bedrock-stream] Sending request to: {}", &url);

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.bedrock_api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .timeout(Duration::from_secs(180))
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
            "Bedrock Stream HTTP {}: {}",
            status, error_text
        )));
    }

    let content_type = response.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    eprintln!("[bedrock-stream] Response content-type: {}", &content_type);

    let mut processor = XmlStreamProcessor::new(emitter, target_lang_name.to_string());

    if content_type.contains("application/vnd.amazon.eventstream") {
        // AWS Event Stream binary format
        let mut byte_stream = response.bytes_stream();
        let mut event_buf: Vec<u8> = Vec::new();

        while let Some(chunk_result) = byte_stream.next().await {
            let chunk = chunk_result.map_err(|e| AppError::LLMResponseError(format!("Stream error: {}", e)))?;
            event_buf.extend_from_slice(&chunk);

            // Parse AWS event stream messages from buffer
            while event_buf.len() >= 12 {
                // Prelude: total_len (4) + headers_len (4) + prelude_crc (4)
                let total_len = u32::from_be_bytes([event_buf[0], event_buf[1], event_buf[2], event_buf[3]]) as usize;
                if event_buf.len() < total_len {
                    break; // Need more data
                }

                let headers_len = u32::from_be_bytes([event_buf[4], event_buf[5], event_buf[6], event_buf[7]]) as usize;
                // Skip prelude (12 bytes), parse headers, then payload
                let headers_start = 12;
                let payload_start = headers_start + headers_len;
                let payload_end = total_len - 4; // Last 4 bytes are message CRC

                // Extract event type from headers
                let mut event_type = String::new();
                let mut pos = headers_start;
                while pos < payload_start && pos < event_buf.len() {
                    if pos >= event_buf.len() { break; }
                    let name_len = event_buf[pos] as usize;
                    pos += 1;
                    if pos + name_len > event_buf.len() { break; }
                    let name = String::from_utf8_lossy(&event_buf[pos..pos + name_len]).to_string();
                    pos += name_len;
                    if pos >= event_buf.len() { break; }
                    let value_type = event_buf[pos];
                    pos += 1;
                    if value_type == 7 {
                        // String type
                        if pos + 2 > event_buf.len() { break; }
                        let value_len = u16::from_be_bytes([event_buf[pos], event_buf[pos + 1]]) as usize;
                        pos += 2;
                        if pos + value_len > event_buf.len() { break; }
                        let value = String::from_utf8_lossy(&event_buf[pos..pos + value_len]).to_string();
                        pos += value_len;
                        if name == ":event-type" {
                            event_type = value;
                        }
                    } else {
                        // Skip unknown header types
                        break;
                    }
                }

                // Extract payload
                if payload_start < payload_end && payload_end <= event_buf.len() {
                    let payload = &event_buf[payload_start..payload_end];
                    if let Ok(payload_str) = std::str::from_utf8(payload) {
                        if !payload_str.is_empty() {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(payload_str) {
                                // Extract text delta from contentBlockDelta events
                                if event_type == "contentBlockDelta" {
                                    if let Some(text) = json.get("delta")
                                        .and_then(|d| d.get("text"))
                                        .and_then(|t| t.as_str())
                                    {
                                        processor.feed(text);
                                    }
                                }
                                // Log non-delta events for debugging
                                if event_type != "contentBlockDelta" {
                                    eprintln!("[bedrock-stream] event: {} payload: {}", &event_type, payload_str);
                                }
                            }
                        }
                    }
                }

                // Remove processed message from buffer
                event_buf = event_buf[total_len..].to_vec();
            }
        }
    } else {
        // Fallback: non-streaming JSON response (API Gateway or proxy might not support event stream)
        eprintln!("[bedrock-stream] Fallback to JSON response (not event stream)");
        let body = response.text().await.unwrap_or_default();
        if let Ok(json) = serde_json::from_str::<BedrockResponse>(&body) {
            let translation = json
                .output
                .and_then(|o| o.message)
                .map(|m| {
                    m.content
                        .iter()
                        .filter_map(|c| c.text.clone())
                        .collect::<Vec<_>>()
                        .join("\n")
                })
                .unwrap_or_default();
            processor.feed(&translation);
        } else {
            // Try to feed raw body through processor
            processor.feed(&body);
        }
    }

    processor.finalize();
    Ok(processor.full_xml)
}

// ===== Helpers =====

/// Build the translation prompt (shared between stream and non-stream)
fn build_prompt(target_lang_name: &str) -> String {
    format!(
        "图片中用户通过矩形框选、画笔涂抹、箭头指向或荧光笔标记选中了文本。\
         请识别用户选中/标记区域内的文本内容，结合整体图像的上下文语境，将其翻译为{target_lang}。\n\n\
         **重要判断规则：**\n\
         - 如果用户用多个矩形框或箭头分别标记了多个不同的文本区域（它们在图片中不相邻），请使用 type=\"multi\" 格式，逐个翻译每个被标记的内容。每个 item 可以是单词、短语或句子。\n\
         - 如果只标记了一个单词（无空格），使用 type=\"word\"。\n\
         - 如果标记的是一个**不完整的短语或词组**（不构成完整句子，例如 \"in the long run\"、\"machine learning\"、\"as a matter of fact\"），使用 type=\"phrase\"。\n\
         - 如果选中的文本包含**一个或多个完整句子**（有主谓结构、以句号/问号/感叹号结尾，或者是一整段文本），使用 type=\"passage\"，直接翻译全文。\n\
         - 简单判断标准：如果文本能独立成句（有完整的主语和谓语），就是 passage；如果只是一个词组/搭配/片段，就是 phrase。\n\n\
         如果图片中没有可识别的文本，请回复：<result><error>未检测到需要翻译的文本</error></result>\n\n\
         请严格使用以下 XML 格式输出，不要输出任何 XML 之外的内容。\n\
         注意：在 <thinking> 中请推断选中文本的源语言（如 English, 日本語, 中文 等），并在 <source-language> 标签中输出。\n\n\
         **格式1: 单个单词 (type=\"word\")**\n\
         像词典一样详尽：列出该单词所有常见词性及对应释义，不要只列上下文中的词性。\n\
         如果是英语单词，还需给出词形变化和词根词缀拆解。\n\
         ```xml\n\
         <result>\n\
         <thinking>简短分析：推断源语言，判断类型（不超过3句话）</thinking>\n\
         <source-language>源语言名称（如 English, 日本語, 中文）</source-language>\n\
         <translation type=\"word\">\n\
         <source>原始单词</source>\n\
         <phonetic>英 [IPA] | 美 [IPA]</phonetic>\n\
         <definitions>\n\
         <!-- 列出所有常见词性的释义，不要遗漏 -->\n\
         <def pos=\"n\">名词释义1；释义2</def>\n\
         <def pos=\"v\">动词释义1；释义2</def>\n\
         <def pos=\"adj\">形容词释义（如有）</def>\n\
         </definitions>\n\
         <context>结合上下文的具体含义（一句话）</context>\n\
         <examples>\n\
         <example>\n\
         <en>英文例句</en>\n\
         <target>{target_lang}例句</target>\n\
         </example>\n\
         </examples>\n\
         <forms>词形变化，如：复数 campaigns | 第三人称单数 campaigns | 现在分词 campaigning | 过去式 campaigned | 过去分词 campaigned</forms>\n\
         <etymology>词根词缀拆解，帮助记忆。如：camp(田野/战场) + -aign(法语后缀) → 原指在战场上的军事行动</etymology>\n\
         </translation>\n\
         </result>\n\
         ```\n\n\
         **格式2: 短语或句子 (type=\"phrase\")**\n\
         ```xml\n\
         <result>\n\
         <thinking>简短分析：推断源语言，判断类型（不超过3句话）</thinking>\n\
         <source-language>源语言名称</source-language>\n\
         <translation type=\"phrase\">\n\
         <source>原始文本</source>\n\
         <target>精准翻译</target>\n\
         <context>结合上下文的具体含义（一句话）</context>\n\
         <grammar>\n\
         <pattern name=\"句式名\">解释</pattern>\n\
         </grammar>\n\
         <vocabulary>\n\
         <word pos=\"词性\">单词: 释义</word>\n\
         </vocabulary>\n\
         </translation>\n\
         </result>\n\
         ```\n\n\
         **格式3: 多个分别标记的内容 (type=\"multi\")**\n\
         当用户用多个矩形框/箭头分别标记了多个不同位置的文本时使用此格式。\n\
         **重要：每个 item 的内容丰富度应与单独翻译时完全一致，不要因为是多个就省略细节。**\n\
         每个 item 根据其内容类型提供完整信息：\n\
         - 单词 item：包含 phonetic、definitions、context、examples、forms（词形变化）、etymology（词根记忆）\n\
         - 短语 item：包含 target（翻译）、context、grammar（核心句式）、vocabulary（重点词汇）\n\
         - 句子 item：包含 target（翻译）、context\n\
         ```xml\n\
         <result>\n\
         <thinking>简短分析：推断源语言，用户分别标记了哪些内容（不超过3句话）</thinking>\n\
         <source-language>源语言名称</source-language>\n\
         <translation type=\"multi\">\n\
         <!-- 单词 item 示例（与单独 word 格式一样详细，字段顺序与显示顺序一致） -->\n\
         <item>\n\
         <source>第一个单词</source>\n\
         <phonetic>英 [IPA] | 美 [IPA]</phonetic>\n\
         <definitions>\n\
         <def pos=\"词性\">释义</def>\n\
         </definitions>\n\
         <context>结合上下文的具体含义（一句话）</context>\n\
         <examples>\n\
         <example>\n\
         <en>英文例句</en>\n\
         <target>{target_lang}例句</target>\n\
         </example>\n\
         </examples>\n\
         <forms>词形变化</forms>\n\
         <etymology>词根词缀拆解</etymology>\n\
         </item>\n\
         <!-- 短语 item 示例（与单独 phrase 格式一样详细） -->\n\
         <item>\n\
         <source>一个短语</source>\n\
         <target>精准翻译</target>\n\
         <context>结合上下文的具体含义（一句话）</context>\n\
         <grammar>\n\
         <pattern name=\"句式名\">解释</pattern>\n\
         </grammar>\n\
         <vocabulary>\n\
         <word pos=\"词性\">单词: 释义</word>\n\
         </vocabulary>\n\
         </item>\n\
         </translation>\n\
         </result>\n\
         ```\n\n\
         **格式4: 完整句子或大段文本 (type=\"passage\")**\n\
         当选中的文本是一个或多个完整句子、或一整段文本时使用此格式，直接翻译全文：\n\
         ```xml\n\
         <result>\n\
         <thinking>简短分析：推断源语言，选中区域包含大段文本（不超过2句话）</thinking>\n\
         <source-language>源语言名称</source-language>\n\
         <translation type=\"passage\">\n\
         <source>原始文本（完整保留）</source>\n\
         <target>完整翻译</target>\n\
         </translation>\n\
         </result>\n\
         ```\n\n\
         只输出 XML，不要输出其他任何内容。",
        target_lang = target_lang_name
    )
}

/// Extract translation type from XML response
fn extract_translation_type(xml: &str) -> Option<String> {
    if let Some(start) = xml.find("type=\"") {
        let after = &xml[start + 6..];
        if let Some(end) = after.find('"') {
            return Some(after[..end].to_string());
        }
    }
    None
}

/// Public wrapper for extract_source_language (used by translate.rs)
pub fn extract_source_language_pub(xml: &str) -> Option<String> {
    extract_source_language(xml)
}

/// Extract <source-language> from LLM XML response using simple regex
fn extract_source_language(xml: &str) -> Option<String> {
    // Try to find <source-language>...</source-language> in the response
    let start_tag = "<source-language>";
    let end_tag = "</source-language>";
    if let Some(start) = xml.find(start_tag) {
        let content_start = start + start_tag.len();
        if let Some(end) = xml[content_start..].find(end_tag) {
            let lang = xml[content_start..content_start + end].trim().to_string();
            if !lang.is_empty() {
                return Some(lang);
            }
        }
    }
    None
}

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
