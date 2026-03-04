use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub enum AppError {
    CaptureError(String),
    ApiKeyNotConfigured,
    ApiAuthError,
    NetworkTimeout,
    NetworkUnavailable,
    RateLimitExceeded,
    LLMResponseError(String),
    ScreenRecordingPermissionDenied,
    NoMonitorFound,
    WindowError(String),
    ConfigError(String),
    IoError(String),
    Internal(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::CaptureError(msg) => write!(f, "屏幕截图失败: {}", msg),
            AppError::ApiKeyNotConfigured => write!(f, "API Key 未配置"),
            AppError::ApiAuthError => write!(f, "API 认证失败，请检查 API Key"),
            AppError::NetworkTimeout => write!(f, "网络请求超时，请检查网络连接"),
            AppError::NetworkUnavailable => write!(f, "网络不可用"),
            AppError::RateLimitExceeded => write!(f, "API 调用频率限制"),
            AppError::LLMResponseError(msg) => write!(f, "LLM 返回异常: {}", msg),
            AppError::ScreenRecordingPermissionDenied => write!(f, "macOS 屏幕录制权限未授予"),
            AppError::NoMonitorFound => write!(f, "未找到显示器"),
            AppError::WindowError(msg) => write!(f, "窗口创建失败: {}", msg),
            AppError::ConfigError(msg) => write!(f, "配置读写错误: {}", msg),
            AppError::IoError(msg) => write!(f, "文件操作失败: {}", msg),
            AppError::Internal(msg) => write!(f, "内部错误: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

impl AppError {
    pub fn from_reqwest(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            AppError::NetworkTimeout
        } else if err.is_connect() {
            AppError::NetworkUnavailable
        } else {
            AppError::Internal(err.to_string())
        }
    }
}
