import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { t } from '../../../lib/i18n';
import type { Provider } from '../../../types/config';

interface ApiSettingsProps {
  provider: Provider;
  apiKey: string;
  endpoint: string;
  model: string;
  extraParams: string;
  bedrockApiKey: string;
  bedrockModelId: string;
  bedrockRegion: string;
  bedrockExtraParams: string;
  onProviderChange: (value: Provider) => void;
  onApiKeyChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onExtraParamsChange: (value: string) => void;
  onBedrockApiKeyChange: (value: string) => void;
  onBedrockModelIdChange: (value: string) => void;
  onBedrockRegionChange: (value: string) => void;
  onBedrockExtraParamsChange: (value: string) => void;
}

/** Validate JSON string, returns null if valid or error message if invalid */
function validateJson(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '{}') return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return t('api.extraParamsError');
    }
    return null;
  } catch {
    return t('api.extraParamsError');
  }
}

/** Format JSON string for display (pretty print if valid) */
function formatJson(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '{}') return '';
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

function ExtraParamsEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [localValue, setLocalValue] = useState(() => {
    const formatted = formatJson(value);
    return formatted || '';
  });
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback((newValue: string) => {
    setLocalValue(newValue);
    const trimmed = newValue.trim();
    if (!trimmed) {
      setError(null);
      onChange('{}');
      return;
    }
    const err = validateJson(trimmed);
    setError(err);
    if (!err) {
      // Normalize to compact JSON for storage
      try {
        const parsed = JSON.parse(trimmed);
        onChange(JSON.stringify(parsed));
      } catch {
        onChange(trimmed);
      }
    }
  }, [onChange]);

  const handleBlur = useCallback(() => {
    // On blur, pretty-print if valid
    const trimmed = localValue.trim();
    if (!trimmed) {
      setLocalValue('');
      return;
    }
    if (!error) {
      const formatted = formatJson(trimmed);
      if (formatted) {
        setLocalValue(formatted);
      }
    }
  }, [localValue, error]);

  // Check if there are configured params
  const hasParams = value.trim() && value.trim() !== '{}';

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span>{t('api.extraParams')}</span>
        {hasParams && !expanded && (
          <span className="ml-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">
            已配置
          </span>
        )}
      </button>
      {expanded && (
        <div className="mt-2">
          <textarea
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder || t('api.extraParamsPlaceholder')}
            rows={4}
            spellCheck={false}
            className={`w-full px-3 py-2 text-xs font-mono border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent resize-y ${
              error
                ? 'border-red-300 focus:ring-red-500 bg-red-50'
                : 'border-gray-200 focus:ring-blue-500'
            }`}
          />
          {error ? (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <XCircle className="w-3 h-3" />
              {error}
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-1">{t('api.extraParamsHint')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiSettings({
  provider, apiKey, endpoint, model, extraParams,
  bedrockApiKey, bedrockModelId, bedrockRegion, bedrockExtraParams,
  onProviderChange, onApiKeyChange, onEndpointChange, onModelChange, onExtraParamsChange,
  onBedrockApiKeyChange, onBedrockModelIdChange, onBedrockRegionChange, onBedrockExtraParamsChange,
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
          <ExtraParamsEditor
            value={extraParams}
            onChange={onExtraParamsChange}
          />
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
          <ExtraParamsEditor
            value={bedrockExtraParams}
            onChange={onBedrockExtraParamsChange}
          />
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