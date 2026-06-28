import React, { useState } from 'react';
import { 
  Sliders, 
  Settings as SettingsIcon, 
  FolderSync, 
  FolderOpen, 
  Key, 
  HelpCircle,
  Database,
  CloudLightning,
  CheckCircle2,
  Lock,
  Wallet
} from 'lucide-react';
import { motion } from 'motion/react';

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<'system' | 'api'>('system');
  const [monitorPath, setMonitorPath] = useState('input/media');
  const [autoScan, setAutoScan] = useState(true);
  const [autoPreflight, setAutoPreflight] = useState(false);
  const [successToast, setSuccessToast] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessToast(true);
    setTimeout(() => setSuccessToast(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">配置中心 (Preferences)</h2>
        <p className="text-xs text-slate-500 mt-1">定制自媒体发布系统参数、目录监听配置、各大平台授权 Token</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-5 border-t border-x border-slate-200/60 shadow-2xs space-x-6">
        <button
          onClick={() => setActiveTab('system')}
          className={`py-3 text-xs font-bold transition-all relative ${
            activeTab === 'system' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          ⚙️ 系统路径与运行参数
          {activeTab === 'system' && (
            <motion.div layoutId="active-settings-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('api')}
          className={`py-3 text-xs font-bold transition-all relative ${
            activeTab === 'api' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          🔑 媒体分发平台 API 密钥
          {activeTab === 'api' && (
            <motion.div layoutId="active-settings-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Body */}
      <div className="bg-white border-b border-x border-slate-200/80 rounded-b-xl p-6 shadow-2xs">
        {activeTab === 'system' ? (
          <form onSubmit={handleSave} className="space-y-6 max-w-xl">
            {/* Folder monitor */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center">
                <FolderOpen className="w-4 h-4 mr-1.5 text-blue-500" />
                本地稿件监听路径 (Hot Folder)
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={monitorPath}
                  onChange={(e) => setMonitorPath(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs bg-slate-50 text-slate-700 border border-slate-200 rounded-lg focus:bg-white focus:border-blue-500 outline-hidden font-mono"
                  required
                />
                <button
                  type="button"
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-all flex items-center space-x-1"
                >
                  <FolderSync className="w-3.5 h-3.5" />
                  <span>选择目录</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400">
                系统将在该路径下自动实时监测 <code className="bg-slate-100 px-1 py-0.2 rounded text-[9px] font-bold">.docx</code>, <code className="bg-slate-100 px-1 py-0.2 rounded text-[9px] font-bold">.md</code>, <code className="bg-slate-100 px-1 py-0.2 rounded text-[9px] font-bold">.txt</code> 文件的增删。
              </p>
            </div>

            {/* Checkbox triggers */}
            <div className="space-y-3 pt-2">
              <label className="flex items-center space-x-3 cursor-pointer text-xs font-medium text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={autoScan}
                  onChange={(e) => setAutoScan(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500/20"
                />
                <span>启动本软件时自动触发本地扫描</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer text-xs font-medium text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={autoPreflight}
                  onChange={(e) => setAutoPreflight(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-white border-slate-300 rounded focus:ring-blue-500/20"
                />
                <span>预检通过后跳过结算，直接启动一键分发机制</span>
              </label>
            </div>

            {/* Database Sync status */}
            <div className="p-4 rounded-xl border border-slate-200/60 bg-slate-50/50 space-y-3">
              <h3 className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                <Database className="w-4 h-4 text-indigo-500" />
                <span>内置持久化层 (Durable Sandbox Storage)</span>
              </h3>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">同步引擎状态</span>
                <span className="text-emerald-500 font-bold flex items-center">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-500" /> 已就绪 (LocalStorage)
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">已用存储空间</span>
                <span className="text-slate-700 font-mono">1.24 MB / 5.00 MB</span>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex items-center space-x-3 pt-4 border-t border-slate-100">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
              >
                保存设置
              </button>
              {successToast && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-xs text-emerald-600 font-semibold flex items-center space-x-1"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>系统设置已成功保存</span>
                </motion.span>
              )}
            </div>
          </form>
        ) : (
          <div className="space-y-6 max-w-xl">
            <div className="p-4 bg-indigo-50/40 text-indigo-800 rounded-xl border border-indigo-200/50 text-xs flex items-start space-x-2.5">
              <Lock className="w-4.5 h-4.5 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">加密沙箱保护中</p>
                <p className="text-[11px] text-indigo-700 mt-1 leading-normal">
                  所有分发平台（头条、微信、百家号等）的安全 API 令牌皆在本地经过 AES-256 加密保存，决不上报任何外部存储。
                </p>
              </div>
            </div>

            {/* Grid of keys */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>微信公众平台 AppSecret</span>
                  <span className="text-[10px] text-slate-400 font-normal">微信开放接口授权</span>
                </label>
                <input
                  type="password"
                  value="••••••••••••••••••••••••••••••••"
                  disabled
                  className="w-full px-3 py-2 text-xs bg-slate-50 text-slate-400 border border-slate-200 rounded-lg font-mono cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>今日头条 Open Token</span>
                  <span className="text-[10px] text-slate-400 font-normal">字节跳动云网关</span>
                </label>
                <input
                  type="password"
                  value="••••••••••••••••••••••••••••••••"
                  disabled
                  className="w-full px-3 py-2 text-xs bg-slate-50 text-slate-400 border border-slate-200 rounded-lg font-mono cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>百家号 OpenAPI Key</span>
                  <span className="text-[10px] text-slate-400 font-normal">百度分发渠道</span>
                </label>
                <input
                  type="password"
                  value="••••••••••••••••••••••••••••••••"
                  disabled
                  className="w-full px-3 py-2 text-xs bg-slate-50 text-slate-400 border border-slate-200 rounded-lg font-mono cursor-not-allowed"
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-400">
              提示：若需要接入新平台，请在主工作台右上角联系技术人员开通特定企业级云通道。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
