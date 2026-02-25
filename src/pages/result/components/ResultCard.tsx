import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { RefreshCw, Copy, X, Check, Loader2, AlertCircle, Settings, BookmarkPlus } from 'lucide-react';
import type { TranslateResult, TranslateError } from '../../../types/translate';
import { saveWordToWordbook } from '../../../lib/tauri-api';

const CARD_WIDTH = 400;
const MAX_CARD_HEIGHT = 500;

// ==================== XML Parsing ====================

interface MultiWordItem {
  source: string;
  phonetic?: string;
  definitions?: Array<{ pos: string; text: string }>;
  context?: string;
  examples?: Array<{ en: string; target: string }>;
}

interface ParsedTranslation {
  type: 'word' | 'phrase' | 'multi' | 'passage' | 'error' | 'raw';
  source: string;       // Original selected text
  context?: string;     // Contextual meaning from the image
  // Word fields
  phonetic?: string;
  definitions?: Array<{ pos: string; text: string }>;
  examples?: Array<{ en: string; target: string }>;
  // Phrase fields
  target?: string;      // Translation
  grammar?: Array<{ name: string; text: string }>;
  vocabulary?: Array<{ pos: string; text: string }>;
  // Multi-word fields
  items?: MultiWordItem[];
  // Error
  error?: string;
  // Raw fallback
  rawText?: string;
}

function parseXmlTranslation(text: string): ParsedTranslation {
  // Strip markdown code fences if present
  let xml = text.trim();
  if (xml.startsWith('```')) {
    xml = xml.replace(/^```(?:xml)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  // Try to extract <result>...</result>
  const resultMatch = xml.match(/<result>([\s\S]*)<\/result>/);
  if (!resultMatch) {
    // Fallback: not XML format
    return { type: 'raw', source: text.substring(0, 80), rawText: text };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return { type: 'raw', source: text.substring(0, 80), rawText: text };
    }

    // Check for error
    const errorEl = doc.querySelector('error');
    if (errorEl) {
      return { type: 'error', source: '', error: errorEl.textContent || '未知错误' };
    }

    const translationEl = doc.querySelector('translation');
    if (!translationEl) {
      return { type: 'raw', source: text.substring(0, 80), rawText: text };
    }

    const type = translationEl.getAttribute('type') as 'word' | 'phrase' | 'multi' | 'passage' || 'phrase';
    const source = doc.querySelector('source')?.textContent?.trim() || '';

    if (type === 'multi') {
      const itemEls = doc.querySelectorAll('item');
      const items: MultiWordItem[] = Array.from(itemEls).map(el => {
        const defEls = el.querySelectorAll('def');
        const definitions = Array.from(defEls).map(d => ({
          pos: d.getAttribute('pos') || '',
          text: d.textContent?.trim() || '',
        }));
        const exampleEls = el.querySelectorAll('example');
        const examples = Array.from(exampleEls).map(ex => ({
          en: ex.querySelector('en')?.textContent?.trim() || '',
          target: ex.querySelector('target')?.textContent?.trim() || '',
        }));
        return {
          source: el.querySelector('source')?.textContent?.trim() || '',
          phonetic: el.querySelector('phonetic')?.textContent?.trim(),
          definitions: definitions.length > 0 ? definitions : undefined,
          context: el.querySelector('context')?.textContent?.trim(),
          examples: examples.length > 0 ? examples : undefined,
        };
      });
      const allSources = items.map(i => i.source).join(', ');
      return { type: 'multi', source: allSources, items };
    } else if (type === 'passage') {
      const target = doc.querySelector('translation > target')?.textContent?.trim();
      return { type: 'passage', source, target };
    } else if (type === 'word') {
      const phonetic = doc.querySelector('phonetic')?.textContent?.trim();
      const defEls = doc.querySelectorAll('def');
      const definitions = Array.from(defEls).map(el => ({
        pos: el.getAttribute('pos') || '',
        text: el.textContent?.trim() || '',
      }));
      const context = doc.querySelector('context')?.textContent?.trim();
      const exampleEls = doc.querySelectorAll('example');
      const examples = Array.from(exampleEls).map(el => ({
        en: el.querySelector('en')?.textContent?.trim() || '',
        target: el.querySelector('target')?.textContent?.trim() || '',
      }));
      return { type: 'word', source, phonetic, definitions, context, examples };
    } else {
      const context = doc.querySelector('context')?.textContent?.trim();
      const target = doc.querySelector('translation > target')?.textContent?.trim();
      const patternEls = doc.querySelectorAll('pattern');
      const grammar = Array.from(patternEls).map(el => ({
        name: el.getAttribute('name') || '',
        text: el.textContent?.trim() || '',
      }));
      const wordEls = doc.querySelectorAll('vocabulary > word');
      const vocabulary = Array.from(wordEls).map(el => ({
        pos: el.getAttribute('pos') || '',
        text: el.textContent?.trim() || '',
      }));
      return { type: 'phrase', source, target, context, grammar, vocabulary };
    }
  } catch {
    return { type: 'raw', source: text.substring(0, 80), rawText: text };
  }
}

// ==================== Rendering ====================

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
      {children}
    </span>
  );
}

function WordResult({ data }: { data: ParsedTranslation }) {
  return (
    <div className="space-y-2">
      <div>
        <span className="text-base font-bold text-gray-900">{data.source}</span>
        {data.phonetic && <span className="ml-2 text-xs text-gray-400">{data.phonetic}</span>}
      </div>
      {data.definitions && data.definitions.length > 0 && (
        <div>
          <SectionLabel>释义</SectionLabel>
          <div className="mt-1 text-sm text-gray-700">
            {data.definitions.map((d, i) => (
              <div key={i}>{d.pos && <span className="text-gray-500">{d.pos}. </span>}{d.text}</div>
            ))}
          </div>
        </div>
      )}
      {data.context && (
        <div>
          <SectionLabel>📌 上下文含义</SectionLabel>
          <div className="mt-1 text-sm text-indigo-700 bg-indigo-50 px-2 py-1.5 rounded">{data.context}</div>
        </div>
      )}
      {data.examples && data.examples.length > 0 && (
        <div>
          <SectionLabel>例句</SectionLabel>
          <div className="mt-1 text-sm text-gray-500">
            {data.examples.map((ex, i) => (
              <div key={i} className="mb-1">
                <div>• EN: {ex.en}</div>
                <div>• {ex.target}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PhraseResult({ data }: { data: ParsedTranslation }) {
  return (
    <div className="space-y-2">
      <div>
        <SectionLabel>原文</SectionLabel>
        <div className="mt-1 text-sm text-gray-500">{data.source}</div>
      </div>
      {data.target && (
        <div>
          <SectionLabel>精准翻译</SectionLabel>
          <div className="mt-1 text-sm text-gray-800 font-medium">{data.target}</div>
        </div>
      )}
      {data.context && (
        <div>
          <SectionLabel>📌 上下文含义</SectionLabel>
          <div className="mt-1 text-sm text-indigo-700 bg-indigo-50 px-2 py-1.5 rounded">{data.context}</div>
        </div>
      )}
      {data.grammar && data.grammar.length > 0 && (
        <div>
          <SectionLabel>核心句式</SectionLabel>
          <div className="mt-1 text-sm text-gray-700">
            {data.grammar.map((g, i) => (
              <div key={i}>{g.name && <span className="font-medium">{g.name}: </span>}{g.text}</div>
            ))}
          </div>
        </div>
      )}
      {data.vocabulary && data.vocabulary.length > 0 && (
        <div>
          <SectionLabel>重点词汇</SectionLabel>
          <div className="mt-1 text-sm text-gray-700">
            {data.vocabulary.map((v, i) => (
              <div key={i}>{v.pos && <span className="text-gray-400">({v.pos}) </span>}{v.text}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MultiResult({ data }: { data: ParsedTranslation }) {
  if (!data.items?.length) return null;
  return (
    <div className="space-y-4">
      {data.items.map((item, idx) => (
        <div key={idx} className={idx > 0 ? 'border-t border-gray-200 pt-3' : ''}>
          <div>
            <span className="text-base font-bold text-gray-900">{item.source}</span>
            {item.phonetic && <span className="ml-2 text-xs text-gray-400">{item.phonetic}</span>}
          </div>
          {item.definitions && item.definitions.length > 0 && (
            <div className="mt-1">
              <SectionLabel>释义</SectionLabel>
              <div className="mt-1 text-sm text-gray-700">
                {item.definitions.map((d, i) => (
                  <div key={i}>{d.pos && <span className="text-gray-500">{d.pos}. </span>}{d.text}</div>
                ))}
              </div>
            </div>
          )}
          {item.context && (
            <div className="mt-1">
              <SectionLabel>📌 上下文含义</SectionLabel>
              <div className="mt-1 text-sm text-indigo-700 bg-indigo-50 px-2 py-1.5 rounded">{item.context}</div>
            </div>
          )}
          {item.examples && item.examples.length > 0 && (
            <div className="mt-1">
              <SectionLabel>例句</SectionLabel>
              <div className="mt-1 text-sm text-gray-500">
                {item.examples.map((ex, i) => (
                  <div key={i} className="mb-1">
                    <div>• EN: {ex.en}</div>
                    <div>• {ex.target}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PassageResult({ data }: { data: ParsedTranslation }) {
  return (
    <div className="space-y-2">
      <div>
        <SectionLabel>原文</SectionLabel>
        <div className="mt-1 text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">{data.source}</div>
      </div>
      {data.target && (
        <div>
          <SectionLabel>翻译</SectionLabel>
          <div className="mt-1 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{data.target}</div>
        </div>
      )}
    </div>
  );
}

function TranslationContent({ data }: { data: ParsedTranslation }) {
  switch (data.type) {
    case 'word':
      return <WordResult data={data} />;
    case 'phrase':
      return <PhraseResult data={data} />;
    case 'multi':
      return <MultiResult data={data} />;
    case 'passage':
      return <PassageResult data={data} />;
    case 'error':
      return <p className="text-gray-500 text-sm">{data.error}</p>;
    case 'raw':
    default:
      return <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">{data.rawText}</p>;
  }
}

// ==================== Main Component ====================

export default function ResultCard() {
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<TranslateError | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedToWordbook, setSavedToWordbook] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo<ParsedTranslation | null>(() => {
    if (!result?.translation) return null;
    return parseXmlTranslation(result.translation);
  }, [result]);

  // Auto-resize window to fit content
  const resizeWindowToFit = useCallback(async () => {
    if (!cardRef.current) return;
    await new Promise(r => setTimeout(r, 50));
    const contentHeight = cardRef.current.scrollHeight;
    const finalHeight = Math.min(contentHeight + 2, MAX_CARD_HEIGHT);
    try {
      await getCurrentWindow().setSize(new LogicalSize(CARD_WIDTH, finalHeight));
    } catch (err) {
      console.error('Failed to resize window:', err);
    }
  }, []);

  useEffect(() => {
    const setupListeners = async () => {
      const unlistenResult = await listen<TranslateResult>('translation-result', (event) => {
        console.log('[llm] Raw translation result:', event.payload.translation);
        setResult(event.payload);
        setLoading(false);
        setError(null);
      });
      const unlistenError = await listen<TranslateError>('translation-error', (event) => {
        setError(event.payload);
        setLoading(false);
      });
      return () => { unlistenResult(); unlistenError(); };
    };
    const cleanup = setupListeners();
    return () => { cleanup.then(fn => fn()); };
  }, []);

  // Resize window when content changes
  useEffect(() => { resizeWindowToFit(); }, [loading, result, error, resizeWindowToFit]);

  // Auto-save to wordbook when result arrives
  // Skip auto-save for passage type (large text) - user decides manually
  useEffect(() => {
    if (result?.translation && parsed) {
      // Don't auto-save passages - too large, let user decide
      if (parsed.type === 'passage') {
        console.log('[wordbook] Passage detected, skipping auto-save (user can save manually)');
        return;
      }
      if (parsed.type === 'multi' && parsed.items?.length) {
        // Save each word separately
        parsed.items.forEach((item) => {
          const wordXml = `<result><translation type="word"><source>${item.source}</source>${item.phonetic ? `<phonetic>${item.phonetic}</phonetic>` : ''}${item.definitions?.map(d => `<definitions><def pos="${d.pos}">${d.text}</def></definitions>`).join('') || ''}${item.context ? `<context>${item.context}</context>` : ''}${item.examples?.map(ex => `<examples><example><en>${ex.en}</en><target>${ex.target}</target></example></examples>`).join('') || ''}</translation></result>`;
          console.log('[wordbook] Auto-saving multi-word item:', item.source);
          saveWordToWordbook(item.source, wordXml, result.sourceLanguage, result.targetLanguage, result.imageBase64)
            .then((entry) => console.log('[wordbook] Auto-save success:', entry.id))
            .catch((err) => console.error('[wordbook] Auto-save failed:', err));
        });
      } else {
        const word = parsed.source || result.translation.substring(0, 80);
        console.log('[wordbook] Auto-saving word:', word.substring(0, 50), 'has_image:', !!result.imageBase64);
        saveWordToWordbook(word, result.translation, result.sourceLanguage, result.targetLanguage, result.imageBase64)
          .then((entry) => console.log('[wordbook] Auto-save success:', entry.id))
          .catch((err) => console.error('[wordbook] Auto-save failed:', err));
      }
    }
  }, [result, parsed]);

  // Manual save to wordbook (for passage type)
  const handleSaveToWordbook = useCallback(async () => {
    if (!result?.translation || !parsed) return;
    const word = parsed.source?.substring(0, 80) || 'passage';
    try {
      await saveWordToWordbook(word, result.translation, result.sourceLanguage, result.targetLanguage, result.imageBase64);
      setSavedToWordbook(true);
      console.log('[wordbook] Manual save success');
    } catch (err) {
      console.error('[wordbook] Manual save failed:', err);
    }
  }, [result, parsed]);

  const handleCopy = useCallback(async () => {
    if (!result?.translation) return;
    try {
      await writeText(result.translation);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) { console.error('Failed to copy:', err); }
  }, [result]);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { await invoke('retry_translation'); }
    catch (err) { console.error('Failed to retry:', err); }
  }, []);

  const handleGoToSettings = useCallback(async () => {
    try { await invoke('open_settings_window'); await getCurrentWindow().close(); }
    catch (err) { console.error('Failed to open settings:', err); }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') getCurrentWindow().close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="bg-white flex flex-col overflow-hidden"
    >
      {/* Header - draggable region */}
      <div
        className="flex items-center justify-between px-4 pt-3 pb-1 cursor-grab active:cursor-grabbing"
        data-tauri-drag-region
      >
        <div className="text-xs text-gray-400 pointer-events-none">
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

      {/* Content - scrollable */}
      <div className="flex-1 px-4 py-2 overflow-y-auto custom-scrollbar" style={{ maxHeight: MAX_CARD_HEIGHT - 80 }}>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 py-2">
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
              <button onClick={handleGoToSettings}
                className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600">
                <Settings className="w-3 h-3" />前往设置
              </button>
            )}
          </div>
        ) : parsed ? (
          <TranslationContent data={parsed} />
        ) : (
          <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
            {result?.translation}
          </p>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex justify-end gap-1 px-3 pb-2 pt-1">
        {/* Save to wordbook button - only shown for passage type */}
        {parsed?.type === 'passage' && !savedToWordbook && (
          <button onClick={handleSaveToWordbook}
            className="text-gray-400 hover:text-indigo-500 transition-colors p-1.5 rounded hover:bg-gray-100"
            title="保存到单词本" disabled={loading || !!error}>
            <BookmarkPlus className="w-3.5 h-3.5" />
          </button>
        )}
        {parsed?.type === 'passage' && savedToWordbook && (
          <span className="text-green-500 p-1.5" title="已保存到单词本">
            <Check className="w-3.5 h-3.5" />
          </span>
        )}
        <button onClick={handleRetry}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded hover:bg-gray-100"
          title="重新翻译" disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={handleCopy}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded hover:bg-gray-100"
          title="复制" disabled={loading || !!error}>
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </motion.div>
  );
}
