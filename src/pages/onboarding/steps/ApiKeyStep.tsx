import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { Key, Loader2, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import type { Provider } from '../../../types/config';

export default function ApiKeyStep() {
  const [provider, setProvider] = useState<Provider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o');
  const [bedrockApiKey, setBedrockApiKey] = useState('');
  const [bedrockModelId, setBedrockModelId] = useState('us.anthropic.claude-sonnet-4-5-20250929-v1:0');
  const [bedrockRegion, setBedrockRegion] = useState('us-east-1');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const saveAndTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save config first so test_api_connection can read it
      const store = await load('config.json', { autoSave: false, defaults: {} });
      await store.set('provider', provider);
      await store.set('apiKey', apiKey);
      await store.set('endpoint', endpoint);
      await store.set('model', model);
      await store.set('bedrockApiKey', bedrockApiKey);
      await store.set('bedrockModelId', bedrockModelId);
      await store.set('bedrockRegion', bedrockRegion);
      await store.save();

      // Test connection
      const result = await invoke<boolean>('test_api_connection');
      setTestResult(result);
    } catch {
      setTestResult(false);
    }
    setTesting(false);
  };

  const hasKey = provider === 'openai' ? !!apiKey : !!bedrockApiKey;

  return (
    <div className="flex flex-col items-center h-full px-8 pt-8 overflow-y-auto">
      <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mb-6">
        <Key className="w-8 h-8 text-purple-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">配置 API Key</h2>
      <p className="text-gray-500 text-sm mb-6 text-center">
        VisionTrans 使用多模态 AI 进行翻译，需要配置 API Key
      </p>

      <div className="w-full max-w-sm space-y-4">
        {/* Provider Selection */}
        <div className="flex gap-2">
          <button
            onClick={() => setProvider('openai')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
              provider === 'openai'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-500'
            }`}
          >
            OpenAI 兼容
          </button>
          <button
            onClick={() => setProvider('bedrock')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
              provider === 'bedrock'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-500'
            }`}
          >
            AWS Bedrock
          </button>
        </div>

        {provider === 'openai' ? (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">API Endpoint</label>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">模型</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Bedrock API Key</label>
              <input
                type="password"
                value={bedrockApiKey}
                onChange={(e) => setBedrockApiKey(e.target.value)}
                placeholder="Bearer token or API Gateway key"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Region</label>
              <input
                type="text"
                value={bedrockRegion}
                onChange={(e) => setBedrockRegion(e.target.value)}
                placeholder="us-east-1"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Model ID</label>
              <input
                type="text"
                value={bedrockModelId}
                onChange={(e) => setBedrockModelId(e.target.value)}
                placeholder="us.anthropic.claude-sonnet-4-5-20250929-v1:0"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        <button
          onClick={saveAndTest}
          disabled={testing || !hasKey}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              测试连接中...
            </>
          ) : testResult === true ? (
            <>
              <CheckCircle className="w-4 h-4" />
              连接成功！配置已保存
            </>
          ) : testResult === false ? (
            <>
              <XCircle className="w-4 h-4" />
              连接失败，请检查配置
            </>
          ) : (
            '保存并测试连接'
          )}
        </button>

        {provider === 'openai' && (
          <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-blue-500"
            >
              获取 OpenAI Key <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
