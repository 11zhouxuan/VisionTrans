import { useState, useEffect, useCallback } from 'react';
import { load } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';
import ApiSettings from './components/ApiSettings';
import HotkeySettings from './components/HotkeySettings';
import ProxySettings from './components/ProxySettings';
import type { AppConfig, ProxyConfig, Provider, UILanguage } from '../../types/config';
import { DEFAULT_CONFIG } from '../../types/config';
import { t, setUILanguage } from '../../lib/i18n';
import { FolderOpen } from 'lucide-react';

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
        const wordbookPath = await store.get<string>('wordbookPath') ?? DEFAULT_CONFIG.wordbookPath;
        const saveScreenshot = await store.get<boolean>('saveScreenshot') ?? DEFAULT_CONFIG.saveScreenshot;
        const onboardingCompleted = await store.get<boolean>('onboardingCompleted') ?? DEFAULT_CONFIG.onboardingCompleted;

        // If wordbookPath is empty, get the default from backend
        let resolvedWordbookPath = wordbookPath;
        if (!resolvedWordbookPath) {
          try {
            resolvedWordbookPath = await invoke<string>('get_default_wordbook_path');
          } catch { /* ignore */ }
        }

        setUILanguage(uiLanguage);
        setConfig({
          provider, apiKey, endpoint, model,
          bedrockApiKey, bedrockModelId, bedrockRegion,
          targetLanguage, uiLanguage, hotkey, proxy,
          wordbookPath: resolvedWordbookPath,
          saveScreenshot,
          onboardingCompleted,
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
      await store.set('wordbookPath', newConfig.wordbookPath);
      await store.set('saveScreenshot', newConfig.saveScreenshot);
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

        {/* Wordbook Path */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 space-y-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">单词本存储路径</h3>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={config.wordbookPath}
              onChange={(e) => updateConfig({ wordbookPath: e.target.value })}
              placeholder="~/Documents/VisionTrans-wordbook"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white font-mono"
            />
            <button
              onClick={() => {
                const path = config.wordbookPath || '';
                if (path) {
                  invoke('open_wordbook_folder', { path }).catch(() => {
                    // Fallback: try opening via shell
                    console.error('Failed to open folder');
                  });
                }
              }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 hover:text-gray-800 transition-colors whitespace-nowrap"
              title="在 Finder 中打开"
            >
              📂 打开
            </button>
          </div>
          <p className="text-xs text-gray-400">
            留空则使用默认路径。单词以 JSON 文件存储，每个单词一个文件。
          </p>
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div>
              <span className="text-sm text-gray-700">保存截图到单词文件</span>
              <p className="text-xs text-gray-400">将截图 Base64 保存到单词 JSON 中（会增大文件体积）</p>
            </div>
            <button
              onClick={() => updateConfig({ saveScreenshot: !config.saveScreenshot })}
              className={`relative w-10 h-5 rounded-full transition-colors ${config.saveScreenshot ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.saveScreenshot ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
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
