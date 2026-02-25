import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Star, Trash2, BookOpen, RefreshCw } from 'lucide-react';
import type { WordEntry } from '../../types/wordbook';
import { getAllWords, toggleStarWord, deleteWordFromWordbook } from '../../lib/tauri-api';
import { parseXmlTranslation, formatTranslation } from '../../lib/xml-parser';

export default function WordbookPage() {
  const [words, setWords] = useState<WordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'starred'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'count'>('time');

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
        <button
          onClick={loadWords}
          className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          title="刷新"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

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
                <th className="py-2 px-2 w-8">ID</th>
                <th className="py-2 px-1 w-8">⭐</th>
                <th className="py-2 px-2 w-40">Word</th>
                <th className="py-2 px-2">Translation (click to expand)</th>
                <th className="py-2 px-2 w-16 text-center">Count</th>
                <th className="py-2 px-2 w-24">Time</th>
                <th className="py-2 px-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredWords.map((word) => (
                <WordRow
                  key={word.id}
                  word={word}
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
  word, onToggleStar, onDelete, formatTime,
}: {
  word: WordEntry;
  onToggleStar: (id: string) => void;
  onDelete: (id: string) => void;
  formatTime: (iso: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Parse XML and format for display
  const displayText = useMemo(() => {
    const parsed = parseXmlTranslation(word.translation);
    return formatTranslation(parsed);
  }, [word.translation]);

  return (
    <tr className="border-b border-gray-100 hover:bg-white transition-colors align-top">
      {/* ID */}
      <td className="py-3 px-2 text-xs text-gray-400 font-mono">
        {word.id.substring(0, 8)}...
      </td>
      {/* Star */}
      <td className="py-3 px-1">
        <button
          onClick={() => onToggleStar(word.id)}
          className={`transition-colors ${word.starred ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-500'}`}
        >
          <Star className={`w-4 h-4 ${word.starred ? 'fill-current' : ''}`} />
        </button>
      </td>
      {/* Word */}
      <td className="py-3 px-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{word.word}</span>
          {word.isSingleWord ? (
            <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded font-medium">Word</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-medium">Phrase</span>
          )}
        </div>
      </td>
      {/* Translation (formatted) */}
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
      {/* Count */}
      <td className="py-3 px-2 text-center">
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          word.queryCount > 1
            ? 'bg-green-100 text-green-700 font-medium'
            : 'bg-gray-100 text-gray-500'
        }`}>
          {word.queryCount}x
        </span>
      </td>
      {/* Time */}
      <td className="py-3 px-2 text-xs text-gray-400">
        {formatTime(word.updatedAt)}
      </td>
      {/* Delete */}
      <td className="py-3 px-2">
        <button
          onClick={() => onDelete(word.id)}
          className="text-gray-300 hover:text-red-500 transition-colors"
          title="删除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}
