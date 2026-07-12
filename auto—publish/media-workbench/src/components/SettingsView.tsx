import React from 'react';
import { FolderOpen, Info, ShieldCheck } from 'lucide-react';

export default function SettingsView() {
  return <div className="max-w-3xl space-y-5">
    <div><h2 className="text-lg font-bold text-slate-800">运行说明</h2><p className="text-xs text-slate-500 mt-1">本页只展示当前桌面应用实际提供的功能。</p></div>
    <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FolderOpen className="w-4 h-4" />工作区文件夹</h3>
      <p className="text-xs text-slate-600 leading-5">将待投稿文章放入工作区的 input/media、input/lieju、input/toutiao 或 input/hepan。请在工作台手动刷新、预检并确认投稿。</p>
    </section>
    <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><ShieldCheck className="w-4 h-4" />凭据与运行环境</h3>
      <p className="text-xs text-slate-600 leading-5">API 密钥、浏览器和平台凭据由工作区环境配置提供。应用不会在此页面保存、加密或展示凭据。</p>
    </section>
    <section className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-xs text-blue-800 flex gap-2"><Info className="w-4 h-4 shrink-0" />投稿始终需要在工作台中由操作员确认；系统不会因文件新增或预检通过而自动投稿。</section>
  </div>;
}
