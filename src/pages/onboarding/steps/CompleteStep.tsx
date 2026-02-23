import { Rocket } from 'lucide-react';

export default function CompleteStep() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
        <Rocket className="w-8 h-8 text-blue-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-3">
        一切就绪！
      </h2>
      <p className="text-gray-500 text-sm leading-relaxed max-w-sm mb-8">
        现在你可以开始使用 VisionTrans 了。
        按下快捷键，涂抹需要翻译的区域，松手即可获得翻译结果。
      </p>

      <div className="bg-gray-50 rounded-xl p-6 w-full max-w-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
          <p className="text-sm text-gray-600 text-left">按下 <kbd className="px-1.5 py-0.5 bg-white rounded border text-xs font-mono">Alt+Q</kbd> 唤醒</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
          <p className="text-sm text-gray-600 text-left">涂抹或框选需要翻译的区域</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
          <p className="text-sm text-gray-600 text-left">松手即可获得翻译结果</p>
        </div>
      </div>
    </div>
  );
}
