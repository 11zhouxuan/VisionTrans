import { Languages, Copy, Download, X, Paintbrush, Square, Minus, Plus, Undo2, Redo2 } from 'lucide-react';
import type { SelectionRect } from '../hooks/useSelection';

type MarkTool = 'none' | 'brush' | 'rect';

interface SelectionToolbarProps {
  selection: SelectionRect;
  markTool: MarkTool;
  brushSize: number;
  brushColor: string;
  onSetMarkTool: (tool: MarkTool) => void;
  onSetBrushSize: (size: number) => void;
  onSetBrushColor: (color: string) => void;
  onTranslate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onCopy: () => void;
  onSave: () => void;
  onCancel: () => void;
}

const COLORS = [
  'rgba(255, 230, 0, 0.35)',
  'rgba(255, 100, 100, 0.35)',
  'rgba(100, 200, 255, 0.35)',
  'rgba(100, 255, 100, 0.35)',
];

export default function SelectionToolbar({
  selection, markTool, brushSize, brushColor,
  onSetMarkTool, onSetBrushSize, onSetBrushColor,
  onTranslate, onUndo, onRedo, canUndo, canRedo,
  onCopy, onSave, onCancel,
}: SelectionToolbarProps) {
  const gap = 8;
  const dockHeight = 90; // Reserve space for macOS Dock
  let left = selection.x + selection.width / 2 - 180;
  let top = selection.y + selection.height + gap;

  // If toolbar would be hidden by Dock, place it above selection or inside
  if (top + 80 > window.innerHeight - dockHeight) {
    top = selection.y - 80 - gap;
    if (top < 10) {
      // If no room above either, place inside selection at bottom
      top = selection.y + selection.height - 80 - gap;
    }
  }
  if (left + 360 > window.innerWidth - 10) left = window.innerWidth - 370;
  if (left < 10) left = 10;
  if (top < 10) top = 10;

  return (
    <div className="fixed z-50 flex flex-col gap-1" style={{ left, top }}>
      <div className="flex items-center gap-1 bg-gray-900/90 backdrop-blur-sm rounded-lg px-1.5 py-1 shadow-xl border border-gray-700/50">
        <button onClick={onTranslate}
          className="flex items-center gap-1.5 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-md transition-colors"
          title="翻译 (Enter)">
          <Languages className="w-3.5 h-3.5" />翻译
        </button>

        <div className="w-px h-5 bg-gray-600" />

        <button onClick={() => onSetMarkTool(markTool === 'brush' ? 'none' : 'brush')}
          className={`p-1.5 rounded transition-colors ${markTool === 'brush' ? 'bg-yellow-500/30 text-yellow-300' : 'text-gray-300 hover:text-white hover:bg-gray-700/50'}`}
          title="画笔标记">
          <Paintbrush className="w-3.5 h-3.5" />
        </button>

        <button onClick={() => onSetMarkTool(markTool === 'rect' ? 'none' : 'rect')}
          className={`p-1.5 rounded transition-colors ${markTool === 'rect' ? 'bg-red-500/30 text-red-300' : 'text-gray-300 hover:text-white hover:bg-gray-700/50'}`}
          title="矩形框选">
          <Square className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-gray-600" />

        {/* Undo/Redo */}
        <button onClick={onUndo} disabled={!canUndo}
          className={`p-1.5 rounded transition-colors ${canUndo ? 'text-gray-300 hover:text-white hover:bg-gray-700/50' : 'text-gray-600 cursor-not-allowed'}`}
          title="撤销 (⌘Z)">
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onRedo} disabled={!canRedo}
          className={`p-1.5 rounded transition-colors ${canRedo ? 'text-gray-300 hover:text-white hover:bg-gray-700/50' : 'text-gray-600 cursor-not-allowed'}`}
          title="重做 (⌘⇧Z)">
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-gray-600" />

        <button onClick={onCopy} className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded transition-colors" title="复制截图">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button onClick={onSave} className="p-1.5 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded transition-colors" title="保存截图">
          <Download className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-gray-600" />

        <button onClick={onCancel} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700/50 rounded transition-colors" title="取消 (Esc)">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {markTool !== 'none' && (
        <div className="flex items-center gap-2 bg-gray-900/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-xl border border-gray-700/50">
          <button onClick={() => onSetBrushSize(Math.max(4, brushSize - 4))}
            className="p-1 text-gray-400 hover:text-white"><Minus className="w-3 h-3" /></button>
          <span className="text-xs text-gray-300 w-6 text-center">{brushSize}</span>
          <button onClick={() => onSetBrushSize(Math.min(40, brushSize + 4))}
            className="p-1 text-gray-400 hover:text-white"><Plus className="w-3 h-3" /></button>
          <div className="w-px h-4 bg-gray-600" />
          {COLORS.map((c) => (
            <button key={c} onClick={() => onSetBrushColor(c)}
              className={`w-5 h-5 rounded-full border-2 transition-transform ${brushColor === c ? 'border-white scale-110' : 'border-gray-600 hover:border-gray-400'}`}
              style={{ backgroundColor: c.replace('0.35', '0.7') }} />
          ))}
        </div>
      )}
    </div>
  );
}
