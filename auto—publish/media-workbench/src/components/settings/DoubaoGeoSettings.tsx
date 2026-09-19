import React, { useEffect, useState } from "react";
import { useSettingsFeature } from "../../features/settings/settings-context";
import type { GeoConfigStatus } from "../../types/geo-knowledge";

export default function DoubaoGeoSettings() {
  const { feature, snapshot } = useSettingsFeature();
  const status = snapshot.geo.data as GeoConfigStatus | null;
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://ark.cn-beijing.volces.com/api/coding/v3");
  const [apiKey, setApiKey] = useState("");
  const [webSearch, setWebSearch] = useState(true);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void feature.refreshGeo("page-open");
  }, [feature]);
  useEffect(() => {
    if (status) {
      setModel(status.model);
      setBaseUrl(status.baseUrl);
      setWebSearch(status.webSearch);
    }
  }, [status]);
  const busy = snapshot.geo.query.loading || snapshot.commands.saveGeo.busy;
  const error =
    snapshot.geo.query.error?.userMessage ||
    snapshot.commands.saveGeo.error?.userMessage;
  async function save() {
    setSaved(false);
    const result = await feature.saveGeo({
      baseUrl,
      model: model.trim(),
      apiKey,
      webSearch,
    });
    if (result?.configured) {
      setApiKey("");
      setSaved(true);
    }
  }
  return (
    <form
      className="grid gap-4 rounded border bg-white p-5 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className="font-semibold">豆包 GEO</h2>
      <p>
        用于客户知识提取与联网研究。保存配置不会发起调用；生成知识库时会发送当前客户资料并产生
        API 用量。
      </p>
      <label>
        接口 / Base URL
        <select className="mt-1 block w-full rounded border p-2" value={baseUrl} disabled={busy} onChange={event => {setBaseUrl(event.target.value); setSaved(false);}}>
          <option value="https://ark.cn-beijing.volces.com/api/coding/v3">Coding Plan（套餐专用）</option>
          <option value="https://ark.cn-beijing.volces.com/api/v3">标准方舟（套餐外按量计费）</option>
        </select>
      </label>
      <p className="break-all">Base URL：{baseUrl}</p>
      <p className="text-amber-700">{baseUrl.endsWith("/coding/v3") ? "使用 Coding Plan 专用地址；Responses 与 web_search 的实际权限仍需验证，套餐用途以服务商条款为准。" : "注意：标准方舟地址不消耗 Coding Plan 套餐额度，可能产生额外费用。"} 不支持时明确报错，不自动切换计费接口。</p>
      <label>
        模型 / Endpoint ID
        <input
          className="mt-1 block w-full rounded border p-2"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          required
          maxLength={200}
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          autoComplete="off"
          className="mt-1 block w-full rounded border p-2"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            status?.configured
              ? "已保存，留空保持原密钥"
              : "请输入火山方舟 API Key"
          }
          required={!status?.configured}
          maxLength={4000}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={webSearch}
          onChange={(event) => setWebSearch(event.target.checked)}
        />
        启用联网搜索
      </label>
      {error && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
      {saved && <p role="status">豆包 GEO 配置已保存。</p>}
      <button
        type="submit"
        className="justify-self-start rounded border px-4 py-2 disabled:opacity-40"
        disabled={busy || !model.trim()}
      >
        保存豆包 GEO 配置
      </button>
    </form>
  );
}
