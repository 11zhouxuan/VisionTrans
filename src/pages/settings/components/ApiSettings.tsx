import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { Provider } from '../../../types/config';

interface ApiSettingsProps {
  provider: Provider;
  apiKey: string;
  endpoint: string;
  model: string;
  bedrockApiKey: string;
  bedrockModelId: string;
  bedrockRegion: string;
  onProviderChange: (value: Provider) => void;
  onApiKeyChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onBedrockApiKeyChange: (value: string) => void;
  onBedrockModelIdChange: (value: string) => void;
  onBedrockRegionChange: (value: string) => void;
}

export default function ApiSettings({
  provider, apiKey, endpoint, model,
  bedrockApiKey, bedrockModelId, bedrockRegion,
  onProviderChange, onApiKeyChange, onEndpointChange, onModelChange,
  onBedrockApiKeyChange, onBedrockModelIdChange, onBedrockRegionChange,
}: ApiSettingsProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<boolean>('test_api_connection');
      setTestResult(result);
    } catch {
      setTestResult(false);
    }
    setTesting(false);
    setTimeout(() => setTestResult(null), 3000);
  };

  const maskKey = (key: string): string => {
    if (key.length <= 8) return key ? '****' : '';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">API 配置</h3>

      {/* Provider Selection */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">服务提供商</label>
        <div className="flex gap-2">
          <button
            onClick={() => onProviderChange('openai')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
              provider === 'openai'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            OpenAI 兼容
          </button>
          <button
            onClick={() => onProviderChange('bedrock')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
              provider === 'bedrock'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            AWS Bedrock
          </button>
        </div>
      </div>

      {provider === 'openai' ? (
        <>
          {/* OpenAI API Key */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {apiKey && (
              <p className="text-xs text-gray-400 mt-1">当前: {maskKey(apiKey)}</p>
            )}
          </div>

          {/* API Endpoint */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">API Endpoint</label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => onEndpointChange(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">模型</label>
            <input
              type="text"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder="gpt-4o"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">如 gpt-4o, gpt-4o-mini, claude-3-5-sonnet-20241022</p>
          </div>
        </>
      ) : (
        <>
          {/* Bedrock API Key */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bedrock API Key / IAM Token</label>
            <input
              type="password"
              value={bedrockApiKey}
              onChange={(e) => onBedrockApiKeyChange(e.target.value)}
              placeholder="Bearer token or API Gateway key"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {bedrockApiKey && (
              <p className="text-xs text-gray-400 mt-1">当前: {maskKey(bedrockApiKey)}</p>
            )}
          </div>

          {/* Bedrock Region */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">AWS Region</label>
            <input
              type="text"
              value={bedrockRegion}
              onChange={(e) => onBedrockRegionChange(e.target.value)}
              placeholder="us-east-1"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">如 us-east-1, us-west-2, ap-northeast-1</p>
          </div>

          {/* Bedrock Model ID */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Model ID</label>
            <input
              type="text"
              value={bedrockModelId}
              onChange={(e) => onBedrockModelIdChange(e.target.value)}
              placeholder="us.anthropic.claude-sonnet-4-5-20250929-v1:0"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">如 us.anthropic.claude-sonnet-4-5-20250929-v1:0</p>
          </div>
        </>
      )}

      {/* Test Connection */}
      <button
        onClick={handleTestConnection}
        disabled={testing || (provider === 'openai' ? !apiKey : !bedrockApiKey)}
        className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {testing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            测试中...
          </>
        ) : testResult === true ? (
          <>
            <CheckCircle className="w-4 h-4" />
            连接成功
          </>
        ) : testResult === false ? (
          <>
            <XCircle className="w-4 h-4" />
            连接失败
          </>
        ) : (
          '测试连接'
        )}
      </button>
    </div>
  );
}
