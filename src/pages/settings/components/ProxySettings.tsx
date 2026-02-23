import type { ProxyConfig } from '../../../types/config';

interface ProxySettingsProps {
  proxy?: ProxyConfig;
  onProxyChange: (proxy?: ProxyConfig) => void;
}

export default function ProxySettings({ proxy, onProxyChange }: ProxySettingsProps) {
  const enabled = !!proxy;

  const handleToggle = () => {
    if (enabled) {
      onProxyChange(undefined);
    } else {
      onProxyChange({ protocol: 'http', url: 'http://127.0.0.1:7890' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">代理设置</h3>
        <button
          onClick={handleToggle}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            enabled ? 'bg-blue-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-4.5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {enabled && proxy && (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">代理协议</label>
            <select
              value={proxy.protocol}
              onChange={(e) => onProxyChange({ ...proxy, protocol: e.target.value as 'http' | 'socks5' })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="http">HTTP</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">代理地址</label>
            <input
              type="text"
              value={proxy.url}
              onChange={(e) => onProxyChange({ ...proxy, url: e.target.value })}
              placeholder="http://127.0.0.1:7890"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </>
      )}
    </div>
  );
}
