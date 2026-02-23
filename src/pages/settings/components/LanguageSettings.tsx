import { t } from '../../../lib/i18n';
import type { UILanguage } from '../../../types/config';

interface LanguageSettingsProps {
  targetLanguage: 'zh' | 'en';
  uiLanguage: UILanguage;
  onTargetLanguageChange: (value: 'zh' | 'en') => void;
  onUILanguageChange: (value: UILanguage) => void;
}

export default function LanguageSettings({
  targetLanguage, uiLanguage,
  onTargetLanguageChange, onUILanguageChange,
}: LanguageSettingsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">{t('lang.title')}</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('lang.uiLanguage')}</label>
        <div className="flex gap-2">
          <button onClick={() => onUILanguageChange('zh')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${uiLanguage === 'zh' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            中文
          </button>
          <button onClick={() => onUILanguageChange('en')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${uiLanguage === 'en' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
            English
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('lang.targetLanguage')}</label>
        <select value={targetLanguage} onChange={(e) => onTargetLanguageChange(e.target.value as 'zh' | 'en')}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white">
          <option value="zh">{t('lang.chinese')}</option>
          <option value="en">{t('lang.english')}</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">{t('lang.autoDetect')}</p>
      </div>
    </div>
  );
}
