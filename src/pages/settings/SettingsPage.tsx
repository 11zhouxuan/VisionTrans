import { useState, useEffect, useCallback } from 'react';
import { load } from '@tauri-apps/plugin-store';
import ApiSettings from './components/ApiSettings';
import HotkeySettings from './components/HotkeySettings';
import ProxySettings from './components/ProxySettings';
import type { AppConfig, ProxyConfig, Provider, UILanguage } from '../../types/config';
import { DEFAULT_CONFIG } from '../../types/config';
import { t, setUILanguage } from '../../lib/i18n';

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [, forceUpdate] = useState(0);

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
        const uiLanguage = await store.get<UILanguage>('uiLanguage') ?? DEFAULT_CONFIG.uiLanguage;
        const hotkey = await store.get<string>('hotkey') ?? DEFAULT_CONFIG.hotkey;
        const proxy = await store.get<ProxyConfig>('proxy') ?? DEFAULT_CONFIG.proxy;
        const onboardingCompleted = await store.get<boolean>('onboardingCompleted') ?? DEFAULT_CONFIG.onboardingCompleted;

        setUILanguage(uiLanguage);
        setConfig({
          provider, apiKey, endpoint, model,
          bedrockApiKey, bedrockModelId, bedrockRegion,
          targetLanguage, uiLanguage, hotkey, proxy, onboardingCompleted,
        });
      } catch (err) {
        console.error('Failed to load config:', err);
      }
    };
    loadConfig();
  }, []);

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
      await store.set('uiLanguage', newConfig.uiLanguage);
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
      // If UI language changed, update the i18n system and force re-render
      if (partial.uiLanguage && partial.uiLanguage !== prev.uiLanguage) {
        setUILanguage(partial.uiLanguage);
        forceUpdate(n => n + 1);
      }
      saveConfig(newConfig);
      return newConfig;
    });
  }, [saveConfig]);

  return (
    <div className="h-screen bg-gray-50 overflow-y-auto custom-scrollbar">
      <div className="max-w-lg mx-auto p-6 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">{t('settings.title')}</h1>
          {saved && (
            <span className="text-xs text-green-500 bg-green-50 px-2 py-1 rounded">{t('settings.saved')}</span>
          )}
        </div>

        {/* Target Language + API Settings (core functionality) */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">{t('lang.targetLanguage')}</h3>
          <select value={config.targetLanguage} onChange={(e) => updateConfig({ targetLanguage: e.target.value as 'zh' | 'en' })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
            <option value="zh">{t('lang.chinese')}</option>
            <option value="en">{t('lang.english')}</option>
          </select>
          <p className="text-xs text-gray-400">{t('lang.autoDetect')}</p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <ApiSettings
            provider={config.provider} apiKey={config.apiKey} endpoint={config.endpoint} model={config.model}
            bedrockApiKey={config.bedrockApiKey} bedrockModelId={config.bedrockModelId} bedrockRegion={config.bedrockRegion}
            onProviderChange={(v) => updateConfig({ provider: v })}
            onApiKeyChange={(v) => updateConfig({ apiKey: v })}
            onEndpointChange={(v) => updateConfig({ endpoint: v })}
            onModelChange={(v) => updateConfig({ model: v })}
            onBedrockApiKeyChange={(v) => updateConfig({ bedrockApiKey: v })}
            onBedrockModelIdChange={(v) => updateConfig({ bedrockModelId: v })}
            onBedrockRegionChange={(v) => updateConfig({ bedrockRegion: v })}
          />
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <HotkeySettings hotkey={config.hotkey} onHotkeyChange={(v) => updateConfig({ hotkey: v })} />
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <ProxySettings proxy={config.proxy} onProxyChange={(v) => updateConfig({ proxy: v })} />
        </div>

        {/* UI Language - at the bottom */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">{t('lang.uiLanguage')}</h3>
          <div className="flex gap-2">
            <button onClick={() => updateConfig({ uiLanguage: 'zh' })}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${config.uiLanguage === 'zh' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              中文
            </button>
            <button onClick={() => updateConfig({ uiLanguage: 'en' })}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${config.uiLanguage === 'en' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              English
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-gray-400 pb-4">
          <p>{t('settings.footer')}</p>
          <p className="mt-1">{t('settings.costNote')}</p>
        </div>
      </div>
    </div>
  );
}
