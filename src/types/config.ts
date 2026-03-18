export type Provider = 'openai' | 'bedrock';

export type UILanguage = 'zh' | 'en';

export interface AppConfig {
  provider: Provider;
  // OpenAI-compatible settings
  apiKey: string;
  endpoint: string;
  model: string;
  extraParams: string; // JSON string for extra API parameters (e.g. temperature, top_p)
  // Bedrock settings
  bedrockApiKey: string;
  bedrockModelId: string;
  bedrockRegion: string;
  bedrockExtraParams: string; // JSON string for extra Bedrock parameters
  // Common settings
  targetLanguage: 'zh' | 'en';
  uiLanguage: UILanguage;
  hotkey: string;
  proxy?: ProxyConfig;
  wordbookPath: string;
  saveScreenshot: boolean;
  maxConcurrency: number;
  enableStream: boolean;
  onboardingCompleted: boolean;
}

export interface ProxyConfig {
  protocol: 'http' | 'socks5';
  url: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  provider: 'openai',
  apiKey: '',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  extraParams: '{}',
  bedrockApiKey: '',
  bedrockModelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  bedrockRegion: 'us-east-1',
  bedrockExtraParams: '{}',
  targetLanguage: 'zh',
  uiLanguage: 'zh',
  hotkey: 'Alt+Q',
  proxy: undefined,
  wordbookPath: '',
  saveScreenshot: true,
  maxConcurrency: 1,
  enableStream: true,
  onboardingCompleted: false,
};
