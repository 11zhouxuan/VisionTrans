import { useState } from 'react';
import { Keyboard } from 'lucide-react';

export default function HotkeyStep() {
  const [hotkey] = useState('Alt+Q');

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-6">
        <Keyboard className="w-8 h-8 text-green-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-3">
        快捷键设置
      </h2>
      <p className="text-gray-500 text-sm leading-relaxed max-w-sm mb-8">
        按下快捷键即可唤醒翻译功能，默认快捷键如下：
      </p>

      <div className="bg-gray-50 rounded-xl p-6 w-full max-w-xs">
        <div className="flex items-center justify-center gap-2">
          <kbd className="px-3 py-2 bg-white rounded-lg shadow-sm border border-gray-200 text-sm font-mono font-bold text-gray-700">
            {navigator.userAgent.includes('Mac') ? 'Option' : 'Alt'}
          </kbd>
          <span className="text-gray-400 text-lg">+</span>
          <kbd className="px-3 py-2 bg-white rounded-lg shadow-sm border border-gray-200 text-sm font-mono font-bold text-gray-700">
            Q
          </kbd>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          当前快捷键: {hotkey}
        </p>
      </div>

      <p className="text-xs text-gray-400 mt-6">
        你可以稍后在设置中修改快捷键
      </p>
    </div>
  );
}
