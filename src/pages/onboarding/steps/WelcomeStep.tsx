import { Sparkles } from 'lucide-react';

export default function WelcomeStep() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-blue-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-3">
        欢迎使用 VisionTrans
      </h2>
      <p className="text-gray-500 text-sm leading-relaxed max-w-sm">
        AI 视觉划词翻译工具，通过全局快捷键一键截屏 + 自由涂抹，
        实现对屏幕上任意元素的精准翻译。
      </p>
      <div className="mt-8 space-y-3 text-left w-full max-w-xs">
        <div className="flex items-start gap-3">
          <span className="text-lg">🎯</span>
          <div>
            <p className="text-sm font-medium text-gray-700">涂抹即翻译</p>
            <p className="text-xs text-gray-400">用马克笔涂抹需要翻译的区域</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-lg">🖼️</span>
          <div>
            <p className="text-sm font-medium text-gray-700">图片也能翻</p>
            <p className="text-xs text-gray-400">图片、视频字幕、PDF 都能翻译</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-lg">⚡</span>
          <div>
            <p className="text-sm font-medium text-gray-700">用完即走</p>
            <p className="text-xs text-gray-400">不打断你的工作流</p>
          </div>
        </div>
      </div>
    </div>
  );
}
