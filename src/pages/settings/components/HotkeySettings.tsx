import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Keyboard } from 'lucide-react';
import { t } from '../../../lib/i18n';

interface HotkeySettingsProps {
  hotkey: string;
  onHotkeyChange: (value: string) => void;
}

export default function HotkeySettings({ hotkey, onHotkeyChange }: HotkeySettingsProps) {
  const [recording, setRecording] = useState(false);
  const [tempKeys, setTempKeys] = useState<string[]>([]);

  const handleStartRecording = useCallback(() => {
    setRecording(true);
    setTempKeys([]);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    const keys: string[] = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');
    if (e.metaKey) keys.push('Super');

    // Use e.code to get the physical key, because on macOS the Option key
    // modifies character output (e.g., Option+Q → "œ" instead of "Q")
    const key = e.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      // Map e.code (e.g., "KeyQ", "Digit1", "F5") to a readable key name
      const code = e.code;
      let keyName: string;
      if (code.startsWith('Key')) {
        keyName = code.slice(3); // "KeyQ" → "Q"
      } else if (code.startsWith('Digit')) {
        keyName = code.slice(5); // "Digit1" → "1"
      } else if (code.startsWith('Numpad')) {
        keyName = 'Num' + code.slice(6); // "Numpad1" → "Num1"
      } else {
        // For special keys (F1-F12, Space, etc.), use e.code directly or e.key
        keyName = key.length === 1 ? key.toUpperCase() : key;
      }
      keys.push(keyName);
    }
    setTempKeys(keys);
  }, [recording]);

  const handleKeyUp = useCallback(async () => {
    if (!recording || tempKeys.length < 2) return;
    const newHotkey = tempKeys.join('+');
    setRecording(false);
    try {
      const success = await invoke<boolean>('update_hotkey', { hotkey: newHotkey });
      if (success) onHotkeyChange(newHotkey);
    } catch (err) {
      console.error('Failed to update hotkey:', err);
    }
  }, [recording, tempKeys, onHotkeyChange]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">{t('hotkey.title')}</h3>
      <div>
        <label className="block text-xs text-gray-500 mb-1">{t('hotkey.globalHotkey')}</label>
        <div className={`flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${recording ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}`}
          onClick={handleStartRecording} onKeyDown={handleKeyDown} onKeyUp={handleKeyUp} tabIndex={0}>
          <Keyboard className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-700">
            {recording ? (tempKeys.length > 0 ? tempKeys.join(' + ') : t('hotkey.recording')) : hotkey}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-1">{t('hotkey.hint')}</p>
      </div>
    </div>
  );
}
