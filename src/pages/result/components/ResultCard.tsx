import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { RefreshCw, Copy, X, Check, Loader2, AlertCircle, Settings } from 'lucide-react';
import type { TranslateResult, TranslateError, StreamEvent } from '../../../types/translate';
import { saveWordToWordbook } from '../../../lib/tauri-api';

const CARD_WIDTH = 400;
const MAX_CARD_HEIGHT = 500;

// ==================== XML Parsing ====================

interface MultiWordItem {
  source: string;
  phonetic?: string;
  forms?: string;
  etymology?: string;
  definitions?: Array<{ pos: string; text: string }>;
  context?: string;
  examples?: Array<{ en: string; target: string }>;
  // Phrase-level fields (for phrase items in multi mode)
  target?: string;
  grammar?: Array<{ name: string; text: string }>;
  vocabulary?: Array<{ pos: string; text: string }>;
}

interface ParsedTranslation {
  type: 'word' | 'phrase' | 'multi' | 'passage' | 'error' | 'raw';
  source: string;       // Original selected text
  context?: string;     // Contextual meaning from the image
  // Word fields
  phonetic?: string;
  forms?: string;       // Word forms (plural, 3rd person, participles, etc.)
  etymology?: string;   // Word root/etymology for memorization
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
    // Sanitize: escape unescaped & characters (not part of XML entities)
    const sanitized = xml.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/g, '&amp;');
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitized, 'text/xml');

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
        const patternEls = el.querySelectorAll('pattern');
        const grammar = Array.from(patternEls).map(p => ({
          name: p.getAttribute('name') || '',
          text: p.textContent?.trim() || '',
        }));
        const wordEls = el.querySelectorAll('vocabulary > word');
        const vocabulary = Array.from(wordEls).map(w => ({
          pos: w.getAttribute('pos') || '',
          text: w.textContent?.trim() || '',
        }));
        return {
          source: el.querySelector('source')?.textContent?.trim() || '',
          phonetic: el.querySelector('phonetic')?.textContent?.trim(),
          forms: el.querySelector('forms')?.textContent?.trim(),
          etymology: el.querySelector('etymology')?.textContent?.trim(),
          definitions: definitions.length > 0 ? definitions : undefined,
          context: el.querySelector('context')?.textContent?.trim(),
          examples: examples.length > 0 ? examples : undefined,
          target: el.querySelector(':scope > target')?.textContent?.trim(),
          grammar: grammar.length > 0 ? grammar : undefined,
          vocabulary: vocabulary.length > 0 ? vocabulary : undefined,
        };
      });
      const allSources = items.map(i => i.source).join(', ');
      return { type: 'multi', source: allSources, items };
    } else if (type === 'passage') {
      const target = doc.querySelector('translation > target')?.textContent?.trim();
      return { type: 'passage', source, target };
    } else if (type === 'word') {
      const phonetic = doc.querySelector('phonetic')?.textContent?.trim();
      const forms = doc.querySelector('forms')?.textContent?.trim();
      const etymology = doc.querySelector('etymology')?.textContent?.trim();
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
      return { type: 'word', source, phonetic, forms, etymology, definitions, context, examples };
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

// ==================== Streaming State ====================

interface StreamingState {
  phase: 'idle' | 'thinking' | 'rendering' | 'complete';
  translationType: string;
  sourceLanguage: string;
  targetLanguage: string;
  // Accumulated field content for progressive rendering
  fields: Record<string, string>;
  // Track which fields are complete
  completedFields: Set<string>;
  // Field attributes (e.g. pos for def)
  fieldAttrs: Record<string, Record<string, string>>;
  // Multi-mode items
  items: Array<{
    fields: Record<string, string>;
    completedFields: Set<string>;
    fieldAttrs: Record<string, Record<string, string>>;
    complete: boolean;
  }>;
  currentItemIndex: number;
}

function createInitialStreamState(): StreamingState {
  return {
    phase: 'idle',
    translationType: '',
    sourceLanguage: '',
    targetLanguage: '',
    fields: {},
    completedFields: new Set(),
    fieldAttrs: {},
    items: [],
    currentItemIndex: -1,
  };
}

// ==================== Rendering ====================

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
      {children}
    </span>
  );
}

function StreamCursor() {
  return <span className="inline-block w-1.5 h-3.5 bg-blue-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />;
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
      {data.forms && (
        <div>
          <SectionLabel>📝 词形变化</SectionLabel>
          <div className="mt-1 text-xs text-gray-500">{data.forms}</div>
        </div>
      )}
      {data.etymology && (
        <div>
          <SectionLabel>🌱 词根记忆</SectionLabel>
          <div className="mt-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-1.5 rounded">{data.etymology}</div>
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
          {item.target && (
            <div className="mt-1">
              <SectionLabel>精准翻译</SectionLabel>
              <div className="mt-1 text-sm text-gray-800 font-medium">{item.target}</div>
            </div>
          )}
          {item.context && (
            <div className="mt-1">
              <SectionLabel>📌 上下文含义</SectionLabel>
              <div className="mt-1 text-sm text-indigo-700 bg-indigo-50 px-2 py-1.5 rounded">{item.context}</div>
            </div>
          )}
          {item.grammar && item.grammar.length > 0 && (
            <div className="mt-1">
              <SectionLabel>核心句式</SectionLabel>
              <div className="mt-1 text-sm text-gray-700">
                {item.grammar.map((g, i) => (
                  <div key={i}>{g.name && <span className="font-medium">{g.name}: </span>}{g.text}</div>
                ))}
              </div>
            </div>
          )}
          {item.vocabulary && item.vocabulary.length > 0 && (
            <div className="mt-1">
              <SectionLabel>重点词汇</SectionLabel>
              <div className="mt-1 text-sm text-gray-700">
                {item.vocabulary.map((v, i) => (
                  <div key={i}>{v.pos && <span className="text-gray-400">({v.pos}) </span>}{v.text}</div>
                ))}
              </div>
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
          {item.forms && (
            <div className="mt-1">
              <SectionLabel>📝 词形变化</SectionLabel>
              <div className="mt-1 text-xs text-gray-500">{item.forms}</div>
            </div>
          )}
          {item.etymology && (
            <div className="mt-1">
              <SectionLabel>🌱 词根记忆</SectionLabel>
              <div className="mt-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-1.5 rounded">{item.etymology}</div>
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

// ==================== Streaming Field Renderer ====================

function StreamingFieldValue({ value, isComplete }: { value: string; isComplete: boolean }) {
  return (
    <span>
      {value}
      {!isComplete && <StreamCursor />}
    </span>
  );
}

function StreamingContent({ stream }: { stream: StreamingState }) {
  const { translationType, fields, completedFields, fieldAttrs, items } = stream;

  if (translationType === 'multi') {
    return (
      <div className="space-y-4">
        {items.map((item, idx) => (
          <StreamingItemContent key={idx} item={item} idx={idx} />
        ))}
      </div>
    );
  }

  return <StreamingFieldsContent fields={fields} completedFields={completedFields} fieldAttrs={fieldAttrs} translationType={translationType} />;
}

function StreamingFieldsContent({ fields, completedFields, fieldAttrs, translationType }: {
  fields: Record<string, string>;
  completedFields: Set<string>;
  fieldAttrs: Record<string, Record<string, string>>;
  translationType: string;
}) {
  const isWord = translationType === 'word';
  const isPassage = translationType === 'passage';

  return (
    <div className="space-y-2">
      {/* Source */}
      {fields['source'] !== undefined && (
        <div>
          {isWord ? (
            <div>
              <span className="text-base font-bold text-gray-900">
                <StreamingFieldValue value={fields['source']} isComplete={completedFields.has('source')} />
              </span>
              {fields['phonetic'] !== undefined && (
                <span className="ml-2 text-xs text-gray-400">
                  <StreamingFieldValue value={fields['phonetic']} isComplete={completedFields.has('phonetic')} />
                </span>
              )}
            </div>
          ) : (
            <div>
              <SectionLabel>{isPassage ? '原文' : '原文'}</SectionLabel>
              <div className="mt-1 text-sm text-gray-500">
                <StreamingFieldValue value={fields['source']} isComplete={completedFields.has('source')} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Definitions (word) */}
      {renderDefinitions(fields, completedFields, fieldAttrs)}

      {/* Target (phrase/passage) */}
      {fields['target'] !== undefined && (
        <div>
          <SectionLabel>{isPassage ? '翻译' : '精准翻译'}</SectionLabel>
          <div className={`mt-1 text-sm ${isPassage ? 'text-gray-800 leading-relaxed whitespace-pre-wrap' : 'text-gray-800 font-medium'}`}>
            <StreamingFieldValue value={fields['target']} isComplete={completedFields.has('target')} />
          </div>
        </div>
      )}

      {/* Context */}
      {fields['context'] !== undefined && (
        <div>
          <SectionLabel>📌 上下文含义</SectionLabel>
          <div className="mt-1 text-sm text-indigo-700 bg-indigo-50 px-2 py-1.5 rounded">
            <StreamingFieldValue value={fields['context']} isComplete={completedFields.has('context')} />
          </div>
        </div>
      )}

      {/* Grammar (phrase) */}
      {renderGrammar(fields, completedFields, fieldAttrs)}

      {/* Vocabulary (phrase) */}
      {renderVocabulary(fields, completedFields, fieldAttrs)}

      {/* Examples */}
      {renderExamples(fields, completedFields)}

      {/* Forms */}
      {fields['forms'] !== undefined && (
        <div>
          <SectionLabel>📝 词形变化</SectionLabel>
          <div className="mt-1 text-xs text-gray-500">
            <StreamingFieldValue value={fields['forms']} isComplete={completedFields.has('forms')} />
          </div>
        </div>
      )}

      {/* Etymology */}
      {fields['etymology'] !== undefined && (
        <div>
          <SectionLabel>🌱 词根记忆</SectionLabel>
          <div className="mt-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-1.5 rounded">
            <StreamingFieldValue value={fields['etymology']} isComplete={completedFields.has('etymology')} />
          </div>
        </div>
      )}
    </div>
  );
}

function StreamingItemContent({ item, idx }: { item: StreamingState['items'][0]; idx: number }) {
  return (
    <div className={idx > 0 ? 'border-t border-gray-200 pt-3' : ''}>
      <StreamingFieldsContent
        fields={item.fields}
        completedFields={item.completedFields}
        fieldAttrs={item.fieldAttrs}
        translationType={item.fields['definitions.def'] !== undefined ? 'word' : 'phrase'}
      />
    </div>
  );
}

function renderDefinitions(fields: Record<string, string>, completedFields: Set<string>, fieldAttrs: Record<string, Record<string, string>>) {
  // Collect all definitions.def entries
  const defKeys = Object.keys(fields).filter(k => k === 'definitions.def' || k.startsWith('definitions.def#'));
  if (defKeys.length === 0 && !fields['definitions']) return null;

  // If we have the container but no children yet, show label only
  if (defKeys.length === 0) {
    return (
      <div>
        <SectionLabel>释义</SectionLabel>
        <div className="mt-1 text-sm text-gray-700"><StreamCursor /></div>
      </div>
    );
  }

  return (
    <div>
      <SectionLabel>释义</SectionLabel>
      <div className="mt-1 text-sm text-gray-700">
        {defKeys.map((key, i) => {
          const pos = fieldAttrs[key]?.pos || '';
          const isComplete = completedFields.has(key);
          return (
            <div key={i}>
              {pos && <span className="text-gray-500">{pos}. </span>}
              <StreamingFieldValue value={fields[key]} isComplete={isComplete} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderExamples(fields: Record<string, string>, completedFields: Set<string>) {
  const enKeys = Object.keys(fields).filter(k => k === 'examples.example.en' || k.startsWith('examples.example.en#'));
  const targetKeys = Object.keys(fields).filter(k => k === 'examples.example.target' || k.startsWith('examples.example.target#'));
  if (enKeys.length === 0 && targetKeys.length === 0 && !fields['examples']) return null;

  if (enKeys.length === 0 && targetKeys.length === 0) {
    return (
      <div>
        <SectionLabel>例句</SectionLabel>
        <div className="mt-1 text-sm text-gray-500"><StreamCursor /></div>
      </div>
    );
  }

  const count = Math.max(enKeys.length, targetKeys.length);
  return (
    <div>
      <SectionLabel>例句</SectionLabel>
      <div className="mt-1 text-sm text-gray-500">
        {Array.from({ length: count }, (_, i) => {
          const enKey = enKeys[i];
          const targetKey = targetKeys[i];
          return (
            <div key={i} className="mb-1">
              {enKey && fields[enKey] !== undefined && (
                <div>• EN: <StreamingFieldValue value={fields[enKey]} isComplete={completedFields.has(enKey)} /></div>
              )}
              {targetKey && fields[targetKey] !== undefined && (
                <div>• <StreamingFieldValue value={fields[targetKey]} isComplete={completedFields.has(targetKey)} /></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderGrammar(fields: Record<string, string>, completedFields: Set<string>, fieldAttrs: Record<string, Record<string, string>>) {
  const patternKeys = Object.keys(fields).filter(k => k === 'grammar.pattern' || k.startsWith('grammar.pattern#'));
  if (patternKeys.length === 0 && !fields['grammar']) return null;

  if (patternKeys.length === 0) {
    return (
      <div>
        <SectionLabel>核心句式</SectionLabel>
        <div className="mt-1 text-sm text-gray-700"><StreamCursor /></div>
      </div>
    );
  }

  return (
    <div>
      <SectionLabel>核心句式</SectionLabel>
      <div className="mt-1 text-sm text-gray-700">
        {patternKeys.map((key, i) => {
          const name = fieldAttrs[key]?.name || '';
          return (
            <div key={i}>
              {name && <span className="font-medium">{name}: </span>}
              <StreamingFieldValue value={fields[key]} isComplete={completedFields.has(key)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderVocabulary(fields: Record<string, string>, completedFields: Set<string>, fieldAttrs: Record<string, Record<string, string>>) {
  const wordKeys = Object.keys(fields).filter(k => k === 'vocabulary.word' || k.startsWith('vocabulary.word#'));
  if (wordKeys.length === 0 && !fields['vocabulary']) return null;

  if (wordKeys.length === 0) {
    return (
      <div>
        <SectionLabel>重点词汇</SectionLabel>
        <div className="mt-1 text-sm text-gray-700"><StreamCursor /></div>
      </div>
    );
  }

  return (
    <div>
      <SectionLabel>重点词汇</SectionLabel>
      <div className="mt-1 text-sm text-gray-700">
        {wordKeys.map((key, i) => {
          const pos = fieldAttrs[key]?.pos || '';
          return (
            <div key={i}>
              {pos && <span className="text-gray-400">({pos}) </span>}
              <StreamingFieldValue value={fields[key]} isComplete={completedFields.has(key)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export default function ResultCard() {
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<TranslateError | null>(null);
  const [copied, setCopied] = useState(false);
  const [streaming, setStreaming] = useState<StreamingState>(createInitialStreamState);
  const cardRef = useRef<HTMLDivElement>(null);
  // Track container child counts for unique keys
  const childCountsRef = useRef<Record<string, number>>({});

  const isStreaming = streaming.phase === 'thinking' || streaming.phase === 'rendering';

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

  // Helper to get target fields/completedFields/fieldAttrs for current context (item or top-level)
  const getStreamTarget = useCallback((s: StreamingState) => {
    if (s.translationType === 'multi' && s.currentItemIndex >= 0 && s.items[s.currentItemIndex]) {
      return s.items[s.currentItemIndex];
    }
    return { fields: s.fields, completedFields: s.completedFields, fieldAttrs: s.fieldAttrs };
  }, []);

  // Handle streaming events
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    setStreaming(prev => {
      const next = { ...prev };

      switch (event.type) {
        case 'thinking':
          next.phase = 'thinking';
          setLoading(false);
          break;

        case 'rendering':
          next.phase = 'rendering';
          next.translationType = event.translationType;
          next.sourceLanguage = event.sourceLanguage;
          next.targetLanguage = event.targetLanguage;
          // Reset child counts for new rendering
          childCountsRef.current = {};
          break;

        case 'item-start': {
          const newItem = {
            fields: {} as Record<string, string>,
            completedFields: new Set<string>(),
            fieldAttrs: {} as Record<string, Record<string, string>>,
            complete: false,
          };
          next.items = [...prev.items, newItem];
          next.currentItemIndex = next.items.length - 1;
          // Reset child counts for new item
          childCountsRef.current = {};
          break;
        }

        case 'item-end': {
          if (next.currentItemIndex >= 0 && next.items[next.currentItemIndex]) {
            const items = [...next.items];
            items[next.currentItemIndex] = { ...items[next.currentItemIndex], complete: true };
            next.items = items;
          }
          next.currentItemIndex = -1;
          break;
        }

        case 'field-start': {
          const field = event.field;
          const target = getStreamTarget(next);

          // For container children (e.g. definitions.def), use counter for unique keys
          if (field.includes('.')) {
            const count = (childCountsRef.current[field] || 0);
            const key = count === 0 ? field : `${field}#${count}`;
            childCountsRef.current[field] = count + 1;
            target.fields[key] = '';
            if (event.attrs) {
              target.fieldAttrs[key] = event.attrs as Record<string, string>;
            }
          } else {
            // Simple field or container
            if (target.fields[field] === undefined) {
              target.fields[field] = '';
            }
            if (event.attrs) {
              target.fieldAttrs[field] = event.attrs as Record<string, string>;
            }
          }

          // Force items array update for multi mode
          if (next.translationType === 'multi' && next.currentItemIndex >= 0) {
            next.items = [...next.items];
          }
          break;
        }

        case 'field-delta': {
          const field = event.field;
          const target = getStreamTarget(next);

          if (field.includes('.')) {
            // Find the latest key for this compound field
            const count = (childCountsRef.current[field] || 1) - 1;
            const key = count === 0 ? field : `${field}#${count}`;
            if (target.fields[key] !== undefined) {
              target.fields[key] += event.text;
            }
          } else {
            if (target.fields[field] !== undefined) {
              target.fields[field] += event.text;
            }
          }

          if (next.translationType === 'multi' && next.currentItemIndex >= 0) {
            next.items = [...next.items];
          }
          break;
        }

        case 'field-end': {
          const field = event.field;
          const target = getStreamTarget(next);

          if (field.includes('.')) {
            const count = (childCountsRef.current[field] || 1) - 1;
            const key = count === 0 ? field : `${field}#${count}`;
            target.completedFields.add(key);
          } else {
            target.completedFields.add(field);
          }

          if (next.translationType === 'multi' && next.currentItemIndex >= 0) {
            next.items = [...next.items];
          }
          break;
        }

        case 'complete':
          next.phase = 'complete';
          break;

        case 'error':
          setError({ code: 'STREAM_ERROR', message: event.message, action: 'retry' });
          next.phase = 'idle';
          break;
      }

      return next;
    });
  }, [getStreamTarget]);

  useEffect(() => {
    const setupListeners = async () => {
      const unlistenResult = await listen<TranslateResult>('translation-result', (event) => {
        console.log('[llm] Raw translation result:', event.payload.translation);
        setResult(event.payload);
        setLoading(false);
        setError(null);
        // When result arrives after streaming, switch to parsed view
        setStreaming(prev => ({ ...prev, phase: 'complete' }));
      });
      const unlistenError = await listen<TranslateError>('translation-error', (event) => {
        setError(event.payload);
        setLoading(false);
        setStreaming(createInitialStreamState());
      });
      const unlistenStream = await listen<StreamEvent>('translation-stream', (event) => {
        handleStreamEvent(event.payload);
      });
      return () => { unlistenResult(); unlistenError(); unlistenStream(); };
    };
    const cleanup = setupListeners();
    return () => { cleanup.then(fn => fn()); };
  }, [handleStreamEvent]);

  // Resize window when content changes
  useEffect(() => { resizeWindowToFit(); }, [loading, result, error, streaming, resizeWindowToFit]);

  // Auto-save to wordbook when result arrives (all types including passage)
  useEffect(() => {
    if (result?.translation && parsed) {
      if (parsed.type === 'multi' && parsed.items?.length) {
        // Save each item separately with correct type detection
        parsed.items.forEach((item) => {
          const itemType = item.definitions && item.definitions.length > 0 ? 'word' : 'phrase';
          console.log('[wordbook] Auto-saving multi item:', item.source, 'type:', itemType);
          saveWordToWordbook(item.source, result.translation, itemType, result.sourceLanguage, result.targetLanguage, result.imageBase64)
            .then((entry) => console.log('[wordbook] Auto-save success:', entry.id))
            .catch((err) => console.error('[wordbook] Auto-save failed:', err));
        });
      } else {
        const word = parsed.source || result.translation.substring(0, 80);
        const wordType = parsed.type === 'word' || parsed.type === 'phrase' || parsed.type === 'passage' ? parsed.type : 'word';
        console.log('[wordbook] Auto-saving:', word.substring(0, 50), 'type:', wordType, 'has_image:', !!result.imageBase64);
        saveWordToWordbook(word, result.translation, wordType, result.sourceLanguage, result.targetLanguage, result.imageBase64)
          .then((entry) => console.log('[wordbook] Auto-save success:', entry.id))
          .catch((err) => console.error('[wordbook] Auto-save failed:', err));
      }
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
    setResult(null);
    setStreaming(createInitialStreamState());
    childCountsRef.current = {};
    try { await invoke('retry_translation'); }
    catch (err) { console.error('Failed to retry:', err); }
  }, []);

  const handleGoToSettings = useCallback(async () => {
    try { await invoke('open_settings_window'); await getCurrentWindow().close(); }
    catch (err) { console.error('Failed to open settings:', err); }
  }, []);

  // Release the concurrency slot when this window closes
  const releaseSlot = useCallback(async () => {
    const label = getCurrentWindow().label;
    try {
      await invoke('release_result_slot', { windowId: label });
    } catch (err) {
      console.error('Failed to release result slot:', err);
    }
  }, []);

  const handleClose = useCallback(async () => {
    await releaseSlot();
    getCurrentWindow().close();
  }, [releaseSlot]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  // Determine header text
  const headerText = (() => {
    if (streaming.phase === 'rendering' || streaming.phase === 'complete') {
      return `${streaming.sourceLanguage || '...'} → ${streaming.targetLanguage || '...'}`;
    }
    if (result) {
      return `${result.sourceLanguage} → ${result.targetLanguage}`;
    }
    return '翻译中...';
  })();

  const typeBadge = (() => {
    const t = streaming.phase === 'rendering' ? streaming.translationType : parsed?.type;
    if (t === 'word') return <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-medium">Word</span>;
    if (t === 'phrase') return <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-medium">Phrase</span>;
    if (t === 'multi') return <span className="text-[9px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded font-medium">Multi</span>;
    if (t === 'passage') return <span className="text-[9px] px-1.5 py-0.5 bg-teal-100 text-teal-600 rounded font-medium">Passage</span>;
    return null;
  })();

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
        <div className="flex items-center gap-2 pointer-events-none">
          <span className="text-xs text-gray-400">{headerText}</span>
          {typeBadge}
        </div>
        <button
          onClick={handleClose}
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
        ) : streaming.phase === 'thinking' ? (
          <div className="flex items-center gap-2 text-gray-400 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">正在思考...</span>
          </div>
        ) : isStreaming ? (
          <StreamingContent stream={streaming} />
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
        <button onClick={handleRetry}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded hover:bg-gray-100"
          title="重新翻译" disabled={loading || isStreaming}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading || isStreaming ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={handleCopy}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded hover:bg-gray-100"
          title="复制" disabled={loading || isStreaming || !!error}>
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </motion.div>
  );
}
