/** A single word item in multi-word results */
export interface MultiWordItem {
  source: string;
  phonetic?: string;
  forms?: string;
  etymology?: string;
  definitions?: Array<{ pos: string; text: string }>;
  context?: string;
  examples?: Array<{ en: string; target: string }>;
  // Phrase-level fields
  target?: string;
  grammar?: Array<{ name: string; text: string }>;
  vocabulary?: Array<{ pos: string; text: string }>;
}

/** Parsed translation result from LLM XML output */
export interface ParsedTranslation {
  type: 'word' | 'phrase' | 'multi' | 'passage' | 'error' | 'raw';
  source: string;
  context?: string;
  phonetic?: string;
  forms?: string;
  etymology?: string;
  definitions?: Array<{ pos: string; text: string }>;
  examples?: Array<{ en: string; target: string }>;
  target?: string;
  grammar?: Array<{ name: string; text: string }>;
  vocabulary?: Array<{ pos: string; text: string }>;
  items?: MultiWordItem[];
  error?: string;
  rawText?: string;
}

/** Parse LLM XML translation output */
export function parseXmlTranslation(text: string): ParsedTranslation {
  let xml = text.trim();
  if (xml.startsWith('```')) {
    xml = xml.replace(/^```(?:xml)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  const resultMatch = xml.match(/<result>([\s\S]*)<\/result>/);
  if (!resultMatch) {
    return { type: 'raw', source: text.substring(0, 80), rawText: text };
  }

  try {
    // Sanitize: escape unescaped & characters (not part of XML entities)
    const sanitized = xml.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/g, '&amp;');
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitized, 'text/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return { type: 'raw', source: text.substring(0, 80), rawText: text };
    }

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
    } else if (type === 'passage') {
      const target = doc.querySelector('translation > target')?.textContent?.trim();
      return { type: 'passage', source, target };
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

/** Format parsed translation to readable text (for wordbook display) */
export function formatTranslation(parsed: ParsedTranslation): string {
  if (parsed.type === 'raw') return parsed.rawText || '';
  if (parsed.type === 'error') return parsed.error || '';

  const lines: string[] = [];

  if (parsed.type === 'multi' && parsed.items?.length) {
    parsed.items.forEach((item, idx) => {
      if (idx > 0) lines.push('');
      lines.push(`▸ ${item.source}`);
      if (item.phonetic) lines.push(`  ${item.phonetic}`);
      if (item.definitions?.length) {
        item.definitions.forEach(d => {
          lines.push(`  ${d.pos ? d.pos + '. ' : ''}${d.text}`);
        });
      }
      if (item.target) lines.push(`  → ${item.target}`);
      if (item.context) lines.push(`  📌 ${item.context}`);
      if (item.grammar?.length) {
        item.grammar.forEach(g => {
          lines.push(`  【句式】${g.name ? g.name + ': ' : ''}${g.text}`);
        });
      }
      if (item.vocabulary?.length) {
        item.vocabulary.forEach(v => {
          lines.push(`  【词汇】${v.pos ? '(' + v.pos + ') ' : ''}${v.text}`);
        });
      }
      if (item.examples?.length) {
        item.examples.forEach(ex => {
          lines.push(`  • ${ex.en}`);
          lines.push(`    ${ex.target}`);
        });
      }
    });
  } else if (parsed.type === 'word') {
    if (parsed.phonetic) lines.push(parsed.phonetic);
    if (parsed.forms) lines.push(`【词形】${parsed.forms}`);
    if (parsed.definitions?.length) {
      lines.push('【释义】');
      parsed.definitions.forEach(d => {
        lines.push(`  ${d.pos ? d.pos + '. ' : ''}${d.text}`);
      });
    }
    if (parsed.context) {
      lines.push(`📌 ${parsed.context}`);
    }
    if (parsed.etymology) lines.push(`🌱 ${parsed.etymology}`);
    if (parsed.examples?.length) {
      lines.push('【例句】');
      parsed.examples.forEach(ex => {
        lines.push(`  • ${ex.en}`);
        lines.push(`  • ${ex.target}`);
      });
    }
  } else if (parsed.type === 'passage') {
    if (parsed.target) lines.push(parsed.target);
  } else {
    if (parsed.target) lines.push(parsed.target);
    if (parsed.context) {
      lines.push(`📌 ${parsed.context}`);
    }
    if (parsed.grammar?.length) {
      lines.push('【句式】');
      parsed.grammar.forEach(g => {
        lines.push(`  ${g.name ? g.name + ': ' : ''}${g.text}`);
      });
    }
    if (parsed.vocabulary?.length) {
      lines.push('【词汇】');
      parsed.vocabulary.forEach(v => {
        lines.push(`  ${v.pos ? '(' + v.pos + ') ' : ''}${v.text}`);
      });
    }
  }

  return lines.join('\n');
}