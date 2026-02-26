import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Star, Trash2, BookOpen, RefreshCw, Columns } from 'lucide-react';
import type { WordEntry } from '../../types/wordbook';
import { getAllWords, toggleStarWord, deleteWordFromWordbook } from '../../lib/tauri-api';
import { parseXmlTranslation, formatTranslation } from '../../lib/xml-parser';

// All available columns
type ColumnKey = 'id' | 'star' | 'word' | 'type' | 'translation' | 'rawOutput' | 'count' | 'time' | 'createdAt' | 'language' | 'delete';

interface ColumnDef {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
  removable: boolean; // can user toggle it?
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'id', label: 'ID', defaultVisible: true, removable: true },
  { key: 'star', label: '⭐ Star', defaultVisible: true, removable: false },
  { key: 'word', label: 'Word', defaultVisible: true, removable: false },
  { key: 'type', label: 'Type', defaultVisible: false, removable: true },
  { key: 'translation', label: 'Translation', defaultVisible: true, removable: false },
  { key: 'rawOutput', label: 'Raw Output', defaultVisible: false, removable: true },
  { key: 'count', label: 'Count', defaultVisible: true, removable: true },
  { key: 'time', label: 'Updated', defaultVisible: true, removable: true },
  { key: 'createdAt', label: 'Created', defaultVisible: false, removable: true },
  { key: 'language', label: 'Language', defaultVisible: false, removable: true },
  { key: 'delete', label: 'Delete', defaultVisible: true, removable: false },
];

const DEFAULT_VISIBLE = new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));

export default function WordbookPage() {
  const [words, setWords] = useState<WordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'starred'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'count'>('time');
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    try {
      const saved = localStorage.getItem('wordbook-columns-v2');
      if (saved) return new Set(JSON.parse(saved) as ColumnKey[]);
    } catch {}
    return new Set(DEFAULT_VISIBLE);
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);

  const toggleColumn = useCallback((key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem('wordbook-columns-v2', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const loadWords = useCallback(async () => {
    setLoading(true);
    try {
      const allWords = await getAllWords();
      setWords(allWords);
    } catch (err) {
      console.error('Failed to load words:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWords(); }, [loadWords]);

  const handleToggleStar = useCallback(async (id: string) => {
    try {
      const updated = await toggleStarWord(id);
      setWords(prev => prev.map(w => w.id === id ? updated : w));
    } catch (err) { console.error('Failed to toggle star:', err); }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteWordFromWordbook(id);
      setWords(prev => prev.filter(w => w.id !== id));
    } catch (err) { console.error('Failed to delete word:', err); }
  }, []);

  // Filter, search, sort
  const filteredWords = words
    .filter(w => {
      if (filter === 'starred' && !w.starred) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return w.word.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'count') return b.queryCount - a.queryCount;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  // Stats
  const totalCount = words.length;
  const starredCount = words.filter(w => w.starred).length;
  const wordCount = words.filter(w => w.isSingleWord).length;
  const phraseCount = words.filter(w => !w.isSingleWord).length;
  const totalQueries = words.reduce((sum, w) => sum + w.queryCount, 0);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    if (diffHour < 24) return `${diffHour}小时前`;
    if (diffDay < 30) return `${diffDay}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  const isCol = (key: ColumnKey) => visibleColumns.has(key);

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Stats Bar */}
      <div className="bg-indigo-600 text-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            <span className="font-bold">VisionTrans 单词本</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span>📚 Total: {totalCount}</span>
            <span>⭐ Starred: {starredCount}</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-3 px-6 py-4">
        {[
          { value: totalCount, label: 'Total Words', color: 'text-indigo-600' },
          { value: wordCount, label: 'Single Words', color: 'text-blue-600' },
          { value: phraseCount, label: 'Phrases', color: 'text-purple-600' },
          { value: starredCount, label: 'Starred', color: 'text-yellow-600' },
          { value: totalQueries, label: 'Total Queries', color: 'text-green-600' },
        ].map(({ value, label, color }) => (
          <div key={label} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <div className="px-6 pb-3 flex gap-3 items-center">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search words or translations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'time' | 'count')}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="time">⏰ Latest</option>
          <option value="count">🔢 Count</option>
        </select>
        <button
          onClick={() => setFilter(filter === 'starred' ? 'all' : 'starred')}
          className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
            filter === 'starred'
              ? 'border-yellow-400 bg-yellow-50 text-yellow-700'
              : 'border-gray-200 text-gray-500 hover:border-yellow-400'
          }`}
        >
          ⭐ Starred Only
        </button>

        {/* Column Picker */}
        <div className="relative">
          <button
            onClick={() => setShowColumnPicker(!showColumnPicker)}
            className={`p-2 rounded-lg border transition-colors ${
              showColumnPicker ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title="显示/隐藏列"
          >
            <Columns className="w-4 h-4" />
          </button>
          {showColumnPicker && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
              <div className="px-3 py-1.5 text-xs text-gray-400 font-semibold uppercase border-b border-gray-100">
                Columns
              </div>
              {ALL_COLUMNS.filter(c => c.removable).map(col => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns.has(col.key)}
                    onChange={() => toggleColumn(col.key)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={loadWords}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          title="刷新"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Click outside to close column picker */}
      {showColumnPicker && (
        <div className="fixed inset-0 z-40" onClick={() => setShowColumnPicker(false)} />
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />加载中...
          </div>
        ) : filteredWords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <BookOpen className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm">
              {searchQuery ? '没有找到匹配的单词' : filter === 'starred' ? '还没有收藏的单词' : '单词本是空的'}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                {isCol('id') && <th className="py-2 px-2 w-8">ID</th>}
                {isCol('star') && <th className="py-2 px-1 w-8">⭐</th>}
                {isCol('word') && <th className="py-2 px-2 w-40">Word</th>}
                {isCol('type') && <th className="py-2 px-2 w-20">Type</th>}
                {isCol('translation') && <th className="py-2 px-2">Translation (click to expand)</th>}
                {isCol('rawOutput') && <th className="py-2 px-2">Raw Output</th>}
                {isCol('count') && <th className="py-2 px-2 w-16 text-center">Count</th>}
                {isCol('time') && <th className="py-2 px-2 w-24">Updated</th>}
                {isCol('createdAt') && <th className="py-2 px-2 w-24">Created</th>}
                {isCol('language') && <th className="py-2 px-2 w-36">Language</th>}
                {isCol('delete') && <th className="py-2 px-2 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {filteredWords.map((word) => (
                <WordRow
                  key={word.id}
                  word={word}
                  visibleColumns={visibleColumns}
                  onToggleStar={handleToggleStar}
                  onDelete={handleDelete}
                  formatTime={formatTime}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Individual word row with expand/collapse */
function WordRow({
  word, visibleColumns, onToggleStar, onDelete, formatTime,
}: {
  word: WordEntry;
  visibleColumns: Set<ColumnKey>;
  onToggleStar: (id: string) => void;
  onDelete: (id: string) => void;
  formatTime: (iso: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rawExpanded, setRawExpanded] = useState(false);
  const isCol = (key: ColumnKey) => visibleColumns.has(key);

  // Parse XML and format for display
  const displayText = useMemo(() => {
    const parsed = parseXmlTranslation(word.translation);
    return formatTranslation(parsed);
  }, [word.translation]);

  return (
    <tr className="border-b border-gray-100 hover:bg-white transition-colors align-top">
      {/* ID */}
      {isCol('id') && (
        <td className="py-3 px-2 text-xs text-gray-400 font-mono">
          {word.id.substring(0, 8)}...
        </td>
      )}
      {/* Star */}
      {isCol('star') && (
        <td className="py-3 px-1">
          <button
            onClick={() => onToggleStar(word.id)}
            className={`transition-colors ${word.starred ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'}`}
          >
            <Star className={`w-4 h-4 ${word.starred ? 'fill-current' : ''}`} />
          </button>
        </td>
      )}
      {/* Word */}
      {isCol('word') && (
        <td className="py-3 px-2">
          <span className="text-sm font-medium text-gray-800">{word.word}</span>
        </td>
      )}
      {/* Type */}
      {isCol('type') && (
        <td className="py-3 px-2">
          {word.isSingleWord ? (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-medium">Word</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-medium">Phrase</span>
          )}
        </td>
      )}
      {/* Translation (formatted) */}
      {isCol('translation') && (
        <td className="py-3 px-2">
          <div
            className={`text-sm text-gray-600 cursor-pointer ${expanded ? '' : 'line-clamp-3'}`}
            onClick={() => setExpanded(!expanded)}
          >
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {displayText}
            </pre>
          </div>
          {!expanded && displayText.length > 100 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-indigo-500 hover:text-indigo-600 mt-1"
            >
              展开全部 ▼
            </button>
          )}
          {expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="text-xs text-indigo-500 hover:text-indigo-600 mt-1"
            >
              收起 ▲
            </button>
          )}
        </td>
      )}
      {/* Raw Output (original LLM XML) */}
      {isCol('rawOutput') && (
        <td className="py-3 px-2">
          <div
            className={`text-xs text-gray-500 cursor-pointer font-mono ${rawExpanded ? '' : 'line-clamp-3'}`}
            onClick={() => setRawExpanded(!rawExpanded)}
          >
            <pre className="whitespace-pre-wrap text-xs leading-relaxed">
              {word.translation}
            </pre>
          </div>
          {!rawExpanded && word.translation.length > 150 && (
            <button onClick={() => setRawExpanded(true)} className="text-xs text-indigo-500 hover:text-indigo-600 mt-1">
              展开全部 ▼
            </button>
          )}
          {rawExpanded && (
            <button onClick={() => setRawExpanded(false)} className="text-xs text-indigo-500 hover:text-indigo-600 mt-1">
              收起 ▲
            </button>
          )}
        </td>
      )}
      {/* Count */}
      {isCol('count') && (
        <td className="py-3 px-2 text-center">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            word.queryCount > 1
              ? 'bg-green-100 text-green-700 font-medium'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {word.queryCount}x
          </span>
        </td>
      )}
      {/* Updated Time */}
      {isCol('time') && (
        <td className="py-3 px-2 text-xs text-gray-400">
          {formatTime(word.updatedAt)}
        </td>
      )}
      {/* Created Time */}
      {isCol('createdAt') && (
        <td className="py-3 px-2 text-xs text-gray-400">
          {formatTime(word.createdAt)}
        </td>
      )}
      {/* Language direction */}
      {isCol('language') && (
        <td className="py-3 px-2 text-xs text-gray-400">
          {word.sourceTitle || '—'}
        </td>
      )}
      {/* Delete */}
      {isCol('delete') && (
        <td className="py-3 px-2">
          <button
            onClick={() => onDelete(word.id)}
            className="text-gray-300 hover:text-red-500 transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      )}
    </tr>
  );
}