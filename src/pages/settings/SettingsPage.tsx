import { useState, useEffect, useCallback } from 'react';
import { load } from '@tauri-apps/plugin-store';
import ApiSettings from './components/ApiSettings';
import LanguageSettings from './components/LanguageSettings';
import HotkeySettings from './components/HotkeySettings';
import ProxySettings from './components/ProxySettings';
import type { AppConfig, ProxyConfig, Provider } from '../../types/config';
import { DEFAULT_CONFIG } from '../../types/config';

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const store = await load('config.json', { autoSave: false, defaults: {} });
        const provider = await store.get<Provider>('provider') ?? DEFAULT_CONFIG.provider;
        const apiKey = await store.get<string>('apiKey') ?? DEFAULT_CONFIG.apiKey;
        const endpoint = await store.get<string>('endpoint') ?? DEFAULT_CONFIG.endpoint;
        const model = await store.get<string>('model') ?? DEFAULT_CONFIG.model;
        const bedrockApiKey = await store.get<string>('bedrockApiKey') ?? DEFAULT_CONFIG.bedrockApiKey;
        const bedrockModelId = await store.get<string>('bedrockModelId') ?? DEFAULT_CONFIG.bedrockModelId;
        const bedrockRegion = await store.get<string>('bedrockRegion') ?? DEFAULT_CONFIG.bedrockRegion;
        const targetLanguage = await store.get<'zh' | 'en'>('targetLanguage') ?? DEFAULT_CONFIG.targetLanguage;
        const hotkey = await store.get<string>('hotkey') ?? DEFAULT_CONFIG.hotkey;
        const proxy = await store.get<ProxyConfig>('proxy') ?? DEFAULT_CONFIG.proxy;
        const onboardingCompleted = await store.get<boolean>('onboardingCompleted') ?? DEFAULT_CONFIG.onboardingCompleted;

        setConfig({
          provider, apiKey, endpoint, model,
          bedrockApiKey, bedrockModelId, bedrockRegion,
          targetLanguage, hotkey, proxy, onboardingCompleted,
        });
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    };
    loadConfig();
  }, []);

  // Save config
  const saveConfig = useCallback(async (newConfig: AppConfig) => {
    try {
      const store = await load('config.json', { autoSave: false, defaults: {} });
      await store.set('provider', newConfig.provider);
      await store.set('apiKey', newConfig.apiKey);
      await store.set('endpoint', newConfig.endpoint);
      await store.set('model', newConfig.model);
      await store.set('bedrockApiKey', newConfig.bedrockApiKey);
      await store.set('bedrockModelId', newConfig.bedrockModelId);
      await store.set('bedrockRegion', newConfig.bedrockRegion);
      await store.set('targetLanguage', newConfig.targetLanguage);
      await store.set('hotkey', newConfig.hotkey);
      await store.set('proxy', newConfig.proxy);
      await store.set('onboardingCompleted', newConfig.onboardingCompleted);
      await store.save();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }, []);

  const updateConfig = useCallback((partial: Partial<AppConfig>) => {
    setConfig(prev => {
      const newConfig = { ...prev, ...partial };
      saveConfig(newConfig);
      return newConfig;
    });
  }, [saveConfig]);

  return (
    <div className="h-screen bg-gray-50 overflow-y-auto custom-scrollbar">
      <div className="max-w-lg mx-auto p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">VisionTrans 设置</h1>
          {saved && (
            <span className="text-xs text-green-500 bg-green-50 px-2 py-1 rounded">
              ✓ 已保存
            </span>
          )}
        </div>

        {/* API Settings */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <ApiSettings
            provider={config.provider}
            apiKey={config.apiKey}
            endpoint={config.endpoint}
            model={config.model}
            bedrockApiKey={config.bedrockApiKey}
            bedrockModelId={config.bedrockModelId}
            bedrockRegion={config.bedrockRegion}
            onProviderChange={(v) => updateConfig({ provider: v })}
            onApiKeyChange={(v) => updateConfig({ apiKey: v })}
            onEndpointChange={(v) => updateConfig({ endpoint: v })}
            onModelChange={(v) => updateConfig({ model: v })}
            onBedrockApiKeyChange={(v) => updateConfig({ bedrockApiKey: v })}
            onBedrockModelIdChange={(v) => updateConfig({ bedrockModelId: v })}
            onBedrockRegionChange={(v) => updateConfig({ bedrockRegion: v })}
          />
        </div>

        {/* Language Settings */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <LanguageSettings
            targetLanguage={config.targetLanguage}
            onTargetLanguageChange={(v) => updateConfig({ targetLanguage: v })}
          />
        </div>

        {/* Hotkey Settings */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <HotkeySettings
            hotkey={config.hotkey}
            onHotkeyChange={(v) => updateConfig({ hotkey: v })}
          />
        </div>

        {/* Proxy Settings */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <ProxySettings
            proxy={config.proxy}
            onProxyChange={(v) => updateConfig({ proxy: v })}
          />
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pb-4">
          <p>VisionTrans v1.0 MVP</p>
          <p className="mt-1">每次翻译约消耗 $0.005 - $0.02 API 费用</p>
        </div>
      </div>
    </div>
  );
}
