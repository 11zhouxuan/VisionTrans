export type UILanguage = 'zh' | 'en';

const translations = {
  zh: {
    // Settings page
    'settings.title': 'VisionTrans 设置',
    'settings.saved': '✓ 已保存',
    'settings.footer': 'VisionTrans v1.0 MVP',

    // API Settings
    'api.title': 'API 配置',
    'api.provider': '服务提供商',
    'api.providerOpenai': 'OpenAI 兼容',
    'api.providerBedrock': 'AWS Bedrock',
    'api.apiKey': 'API Key',
    'api.apiKeyPlaceholder': 'sk-...',
    'api.apiKeyCurrent': '当前',
    'api.endpoint': 'API Endpoint',
    'api.endpointPlaceholder': 'https://api.openai.com/v1',
    'api.model': '模型',
    'api.modelPlaceholder': 'gpt-4o',
    'api.modelHint': '如 gpt-4o, gpt-4o-mini, claude-3-5-sonnet-20241022',
    'api.bedrockApiKey': 'Bedrock API Key / IAM Token',
    'api.bedrockApiKeyPlaceholder': 'Bearer token or API Gateway key',
    'api.bedrockRegion': 'AWS Region',
    'api.bedrockRegionPlaceholder': 'us-east-1',
    'api.bedrockRegionHint': '如 us-east-1, us-west-2, ap-northeast-1',
    'api.bedrockModelId': 'Model ID',
    'api.bedrockModelIdPlaceholder': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'api.bedrockModelIdHint': '如 us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'api.testConnection': '测试连接',
    'api.testing': '测试中...',
    'api.testSuccess': '连接成功',
    'api.testFailed': '连接失败',

    // Language Settings
    'lang.title': '语言设置',
    'lang.targetLanguage': '目标语言',
    'lang.chinese': '中文',
    'lang.english': 'English',
    'lang.autoDetect': '源语言由 AI 自动识别',
    'lang.uiLanguage': '界面语言',

    // Hotkey Settings
    'hotkey.title': '快捷键设置',
    'hotkey.globalHotkey': '全局快捷键',
    'hotkey.recording': '请按下快捷键组合...',
    'hotkey.hint': '点击上方区域，然后按下新的快捷键组合',

    // Proxy Settings
    'proxy.title': '代理设置',
    'proxy.protocol': '代理协议',
    'proxy.address': '代理地址',
    'proxy.addressPlaceholder': 'http://127.0.0.1:7890',

    // Concurrency Settings
    'concurrency.title': '并发翻译',
    'concurrency.max': '最大并发数',
    'concurrency.hint': '同时进行的翻译任务数量，超过限制时新请求将被拒绝',
  },
  en: {
    // Settings page
    'settings.title': 'VisionTrans Settings',
    'settings.saved': '✓ Saved',
    'settings.footer': 'VisionTrans v1.0 MVP',

    // API Settings
    'api.title': 'API Configuration',
    'api.provider': 'Provider',
    'api.providerOpenai': 'OpenAI Compatible',
    'api.providerBedrock': 'AWS Bedrock',
    'api.apiKey': 'API Key',
    'api.apiKeyPlaceholder': 'sk-...',
    'api.apiKeyCurrent': 'Current',
    'api.endpoint': 'API Endpoint',
    'api.endpointPlaceholder': 'https://api.openai.com/v1',
    'api.model': 'Model',
    'api.modelPlaceholder': 'gpt-4o',
    'api.modelHint': 'e.g. gpt-4o, gpt-4o-mini, claude-3-5-sonnet-20241022',
    'api.bedrockApiKey': 'Bedrock API Key / IAM Token',
    'api.bedrockApiKeyPlaceholder': 'Bearer token or API Gateway key',
    'api.bedrockRegion': 'AWS Region',
    'api.bedrockRegionPlaceholder': 'us-east-1',
    'api.bedrockRegionHint': 'e.g. us-east-1, us-west-2, ap-northeast-1',
    'api.bedrockModelId': 'Model ID',
    'api.bedrockModelIdPlaceholder': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'api.bedrockModelIdHint': 'e.g. us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'api.testConnection': 'Test Connection',
    'api.testing': 'Testing...',
    'api.testSuccess': 'Connected',
    'api.testFailed': 'Failed',

    // Language Settings
    'lang.title': 'Language Settings',
    'lang.targetLanguage': 'Target Language',
    'lang.chinese': '中文',
    'lang.english': 'English',
    'lang.autoDetect': 'Source language auto-detected by AI',
    'lang.uiLanguage': 'UI Language',

    // Hotkey Settings
    'hotkey.title': 'Hotkey Settings',
    'hotkey.globalHotkey': 'Global Hotkey',
    'hotkey.recording': 'Press a key combination...',
    'hotkey.hint': 'Click the area above, then press a new key combination',

    // Proxy Settings
    'proxy.title': 'Proxy Settings',
    'proxy.protocol': 'Protocol',
    'proxy.address': 'Proxy Address',
    'proxy.addressPlaceholder': 'http://127.0.0.1:7890',

    // Concurrency Settings
    'concurrency.title': 'Concurrent Translations',
    'concurrency.max': 'Max Concurrency',
    'concurrency.hint': 'Number of simultaneous translation tasks. New requests will be rejected when limit is reached.',
  },
} as const;

type TranslationKey = keyof typeof translations.zh;

let currentLang: UILanguage = 'zh';

export function setUILanguage(lang: UILanguage) {
  currentLang = lang;
}

export function getUILanguage(): UILanguage {
  return currentLang;
}

export function t(key: TranslationKey): string {
  return translations[currentLang][key] || translations.zh[key] || key;
}
