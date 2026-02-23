interface LanguageSettingsProps {
  targetLanguage: 'zh' | 'en';
  onTargetLanguageChange: (value: 'zh' | 'en') => void;
}

export default function LanguageSettings({ targetLanguage, onTargetLanguageChange }: LanguageSettingsProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">语言设置</h3>

      <div>
        <label className="block text-xs text-gray-500 mb-1">目标语言</label>
        <select
          value={targetLanguage}
          onChange={(e) => onTargetLanguageChange(e.target.value as 'zh' | 'en')}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">源语言由 AI 自动识别</p>
      </div>
    </div>
  );
}
