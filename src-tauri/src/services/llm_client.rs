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
        "zh" => "简体中文",
        "en" => "English",
        _ => "简体中文",
    };

    let prompt = format!(
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
         <forms>词形变化，如：复数 campaigns | 第三人称单数 campaigns | 现在分词 campaigning | 过去式 campaigned | 过去分词 campaigned</forms>\n\
         <definitions>\n\
         <!-- 列出所有常见词性的释义，不要遗漏 -->\n\
         <def pos=\"n\">名词释义1；释义2</def>\n\
         <def pos=\"v\">动词释义1；释义2</def>\n\
         <def pos=\"adj\">形容词释义（如有）</def>\n\
         </definitions>\n\
         <etymology>词根词缀拆解，帮助记忆。如：camp(田野/战场) + -aign(法语后缀) → 原指在战场上的军事行动</etymology>\n\
         <context>结合上下文的具体含义（一句话）</context>\n\
         <examples>\n\
         <example>\n\
         <en>英文例句</en>\n\
         <target>{target_lang}例句</target>\n\
         </example>\n\
         </examples>\n\
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
         - 单词 item：包含 phonetic、definitions、context、examples\n\
         - 短语 item：包含 target（翻译）、context、grammar（核心句式）、vocabulary（重点词汇）\n\
         - 句子 item：包含 target（翻译）、context\n\
         ```xml\n\
         <result>\n\
         <thinking>简短分析：推断源语言，用户分别标记了哪些内容（不超过3句话）</thinking>\n\
         <source-language>源语言名称</source-language>\n\
         <translation type=\"multi\">\n\
         <!-- 单词 item 示例 -->\n\
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
    );

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

// ===== Helpers =====

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
