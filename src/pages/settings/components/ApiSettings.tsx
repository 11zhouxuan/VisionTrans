import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { t } from '../../../lib/i18n';
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
      <h3 className="text-sm font-semibold text-gray-700">{t('api.title')}</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('api.provider')}</label>
        <div className="flex gap-2">
          <button onClick={() => onProviderChange('openai')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${provider === 'openai' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {t('api.providerOpenai')}
          </button>
          <button onClick={() => onProviderChange('bedrock')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${provider === 'bedrock' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            {t('api.providerBedrock')}
          </button>
        </div>
      </div>

      {provider === 'openai' ? (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('api.apiKey')}</label>
            <input type="password" value={apiKey} onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={t('api.apiKeyPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            {apiKey && <p className="text-xs text-gray-400 mt-1">{t('api.apiKeyCurrent')}: {maskKey(apiKey)}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('api.endpoint')}</label>
            <input type="text" value={endpoint} onChange={(e) => onEndpointChange(e.target.value)}
              placeholder={t('api.endpointPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('api.model')}</label>
            <input type="text" value={model} onChange={(e) => onModelChange(e.target.value)}
              placeholder={t('api.modelPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <p className="text-xs text-gray-400 mt-1">{t('api.modelHint')}</p>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('api.bedrockApiKey')}</label>
            <input type="password" value={bedrockApiKey} onChange={(e) => onBedrockApiKeyChange(e.target.value)}
              placeholder={t('api.bedrockApiKeyPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            {bedrockApiKey && <p className="text-xs text-gray-400 mt-1">{t('api.apiKeyCurrent')}: {maskKey(bedrockApiKey)}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('api.bedrockRegion')}</label>
            <input type="text" value={bedrockRegion} onChange={(e) => onBedrockRegionChange(e.target.value)}
              placeholder={t('api.bedrockRegionPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <p className="text-xs text-gray-400 mt-1">{t('api.bedrockRegionHint')}</p>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('api.bedrockModelId')}</label>
            <input type="text" value={bedrockModelId} onChange={(e) => onBedrockModelIdChange(e.target.value)}
              placeholder={t('api.bedrockModelIdPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            <p className="text-xs text-gray-400 mt-1">{t('api.bedrockModelIdHint')}</p>
          </div>
        </>
      )}

      <button onClick={handleTestConnection}
        disabled={testing || (provider === 'openai' ? !apiKey : !bedrockApiKey)}
        className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {testing ? (<><Loader2 className="w-4 h-4 animate-spin" />{t('api.testing')}</>)
          : testResult === true ? (<><CheckCircle className="w-4 h-4" />{t('api.testSuccess')}</>)
          : testResult === false ? (<><XCircle className="w-4 h-4" />{t('api.testFailed')}</>)
          : t('api.testConnection')}
      </button>
    </div>
  );
}
