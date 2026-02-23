import { Paintbrush, Square } from 'lucide-react';

interface ToolBarProps {
  mode: 'brush' | 'rect';
  onModeChange: (mode: 'brush' | 'rect') => void;
}

/**
 * Toolbar for switching between brush and rectangle selection modes
 */
export default function ToolBar({ mode, onModeChange }: ToolBarProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex gap-1 bg-gray-900/80 backdrop-blur-sm rounded-lg p-1 shadow-lg">
      <button
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          mode === 'brush'
            ? 'bg-yellow-500 text-gray-900'
            : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
        }`}
        onClick={() => onModeChange('brush')}
        title="涂抹模式"
      >
        <Paintbrush className="w-3.5 h-3.5" />
        涂抹
      </button>
      <button
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          mode === 'rect'
            ? 'bg-blue-500 text-white'
            : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
        }`}
        onClick={() => onModeChange('rect')}
        title="框选模式"
      >
        <Square className="w-3.5 h-3.5" />
        框选
      </button>
      <div className="border-l border-gray-600 mx-1" />
      <span className="text-gray-400 text-xs px-2 py-1.5 select-none">
        Esc 取消 | 右键取消
      </span>
    </div>
  );
}
