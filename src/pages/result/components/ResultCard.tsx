import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { RefreshCw, Copy, X, Check, Loader2, AlertCircle, Settings } from 'lucide-react';
import type { TranslateResult, TranslateError } from '../../../types/translate';
import { CARD_WIDTH, CARD_MARGIN } from '../../../lib/constants';

export default function ResultCard() {
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<TranslateError | null>(null);
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Listen for translation result event
  useEffect(() => {
    const setupListeners = async () => {
      const unlistenResult = await listen<TranslateResult>('translation-result', (event) => {
        setResult(event.payload);
        setLoading(false);
        setError(null);
      });

      const unlistenError = await listen<TranslateError>('translation-error', (event) => {
        setError(event.payload);
        setLoading(false);
      });

      return () => {
        unlistenResult();
        unlistenError();
      };
    };

    const cleanup = setupListeners();
    return () => {
      cleanup.then(fn => fn());
    };
  }, []);

  // Smart positioning: avoid screen edges
  useEffect(() => {
    const initPosition = async () => {
      try {
        const win = getCurrentWindow();
        const pos = await win.outerPosition();
        setPosition({ x: pos.x, y: pos.y });
      } catch {
        // Default position
        setPosition({ x: 100, y: 100 });
      }
    };
    initPosition();
  }, []);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!result?.translation) return;
    try {
      await writeText(result.translation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [result]);

  // Retry translation
  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await invoke('retry_translation');
    } catch (err) {
      console.error('Failed to retry:', err);
    }
  }, []);

  // Go to settings
  const handleGoToSettings = useCallback(async () => {
    try {
      await invoke('open_settings_window');
      await getCurrentWindow().close();
    } catch (err) {
      console.error('Failed to open settings:', err);
    }
  }, []);

  // Close on Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        getCurrentWindow().close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPosition({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden"
      style={{ width: CARD_WIDTH, margin: CARD_MARGIN }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="text-xs text-gray-400">
          {result ? `${result.sourceLanguage} → ${result.targetLanguage}` : '翻译中...'}
        </div>
        <button
          onClick={() => getCurrentWindow().close()}
          className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded hover:bg-gray-100"
          title="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 py-2 min-h-[60px]">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">正在翻译...</span>
          </div>
        ) : error ? (
          <div className="py-2">
            <div className="flex items-start gap-2 text-red-500">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="text-sm">{error.message}</span>
            </div>
            {error.action === 'settings' && (
              <button
                onClick={handleGoToSettings}
                className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
              >
                <Settings className="w-3 h-3" />
                前往设置
              </button>
            )}
          </div>
        ) : (
          <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
            {result?.translation}
          </p>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex justify-end gap-1 px-3 pb-3">
        <button
          onClick={handleRetry}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded hover:bg-gray-100"
          title="重新翻译"
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={handleCopy}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded hover:bg-gray-100"
          title="复制"
          disabled={loading || !!error}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </motion.div>
  );
}
