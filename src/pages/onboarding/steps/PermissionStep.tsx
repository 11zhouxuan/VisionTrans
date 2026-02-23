import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Shield, CheckCircle, AlertTriangle } from 'lucide-react';

export default function PermissionStep() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    // Check platform
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) {
      setPlatform('macos');
      checkPermission();
    } else {
      setPlatform('windows');
      setHasPermission(true);
    }
  }, []);

  const checkPermission = async () => {
    setChecking(true);
    try {
      const result = await invoke<{ screenRecording: boolean }>('check_permission');
      setHasPermission(result.screenRecording);
    } catch {
      setHasPermission(false);
    }
    setChecking(false);
  };

  const requestPermission = async () => {
    try {
      await invoke<boolean>('request_permission');
      // Re-check after a delay
      setTimeout(checkPermission, 2000);
    } catch (err) {
      console.error('Failed to request permission:', err);
    }
  };

  if (platform === 'windows') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <CheckCircle className="w-12 h-12 text-green-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">权限就绪</h2>
        <p className="text-gray-500 text-sm">Windows 系统无需额外权限配置</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mb-6">
        <Shield className="w-8 h-8 text-orange-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-3">
        屏幕录制权限
      </h2>
      <p className="text-gray-500 text-sm leading-relaxed max-w-sm mb-6">
        VisionTrans 需要「屏幕录制」权限才能截取屏幕内容进行翻译。
        请在系统设置中授予权限。
      </p>

      {hasPermission === true ? (
        <div className="flex items-center gap-2 text-green-500">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">权限已授予</span>
        </div>
      ) : hasPermission === false ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-orange-500">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-medium">权限未授予</span>
          </div>
          <button
            onClick={requestPermission}
            className="px-6 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
          >
            打开系统设置
          </button>
          <button
            onClick={checkPermission}
            disabled={checking}
            className="block mx-auto text-xs text-gray-400 hover:text-gray-600"
          >
            {checking ? '检测中...' : '重新检测'}
          </button>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">检测中...</p>
      )}

      <div className="mt-8 bg-gray-50 rounded-lg p-4 text-left max-w-sm">
        <p className="text-xs text-gray-500 font-medium mb-2">操作步骤：</p>
        <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
          <li>打开「系统设置」→「隐私与安全性」</li>
          <li>找到「屏幕录制」选项</li>
          <li>勾选 VisionTrans</li>
          <li>如提示需要重启，请重启应用</li>
        </ol>
      </div>
    </div>
  );
}
