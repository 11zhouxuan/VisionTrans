import { Languages, Copy, Download, X, Paintbrush } from 'lucide-react';
import type { SelectionRect } from '../hooks/useSelection';

interface SelectionToolbarProps {
  selection: SelectionRect;
  brushMode: boolean;
  onToggleBrush: () => void;
  onTranslate: () => void;
  onCopy: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function SelectionToolbar({
  selection,
  brushMode,
  onToggleBrush,
  onTranslate,
  onCopy,
  onSave,
  onCancel,
}: SelectionToolbarProps) {
  const toolbarWidth = 240;
  const toolbarHeight = 36;
  const gap = 8;

  let left = selection.x + selection.width - toolbarWidth;
  let top = selection.y + selection.height + gap;

  if (top + toolbarHeight > window.innerHeight - 10) {
    top = selection.y - toolbarHeight - gap;
  }
  if (left + toolbarWidth > window.innerWidth - 10) {
    left = window.innerWidth - toolbarWidth - 10;
  }
  if (left < 10) left = 10;
  if (top < 10) top = 10;

  return (
    <div
      className="fixed z-50 flex items-center gap-1 bg-gray-900/90 backdrop-blur-sm rounded-lg px-1.5 py-1 shadow-xl border border-gray-700/50"
      style={{ left, top }}
    >
      <button
        onClick={onTranslate}
        className="flex items-center gap-1.5 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-md transition-colors"
        title="翻译 (Enter)"
      >
        <Languages className="w-3.5 h-3.5" />
        翻译
      </button>

      <div className="w-px h-5 bg-gray-600" />

      {/* Brush marker tool */}
      <button
        onClick={onToggleBrush}
        className={`p-1.5 rounded transition-colors ${
          brushMode
            ? 'bg-yellow-500/30 text-yellow-300'
            : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
        }`}
        title="画笔标记"
      >
        <Paintbrush className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={onCopy}
        className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
        title="复制截图"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={onSave}
        className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
        title="保存截图"
      >
        <Download className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-5 bg-gray-600" />

      <button
        onClick={onCancel}
        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700/50 rounded transition-colors"
        title="取消 (Esc)"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
