import { useEffect, useState } from "react";
import { useSettingsFeature } from "../features/settings/settings-context";
import type { MediaProviderStatus } from "../types/settings";

export default function MediaThirdPartyIdControl() {
  const { feature, snapshot } = useSettingsFeature();
  const status = snapshot.media.data as MediaProviderStatus | null;
  const [value, setValue] = useState("");
  const saving = snapshot.commands.saveMedia.busy;
  const readOnly = status?.source === "environment";
  const configured = status?.configured === true;
  const error =
    snapshot.media.query.error?.userMessage ||
    snapshot.commands.saveMedia.error?.userMessage ||
    null;

  useEffect(() => {
    setValue(status?.thirdPartyId || "");
  }, [status?.thirdPartyId]);

  const save = async () => {
    await feature.saveMedia({ thirdPartyId: value.trim() });
  };

  return (
    <div className="flex min-w-0 items-center gap-2" data-third-party-id-setting="true">
      <label className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate-600">
        <span className="shrink-0">第三方标识</span>
        <input
          aria-label="第三方标识"
          value={value}
          maxLength={128}
          onChange={(event) => setValue(event.target.value)}
          disabled={snapshot.media.query.loading || saving || readOnly || !configured}
          placeholder={configured ? "留空则自动生成" : "请先配置媒体服务"}
          title={readOnly ? "由环境变量 XQW_THIRD_ID 控制" : "长期保存；留空时每次投稿自动生成唯一标识"}
          className="w-40 min-w-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 disabled:bg-slate-100"
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={snapshot.media.query.loading || saving || readOnly || !configured}
        className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 disabled:opacity-50"
      >
        {saving ? "保存中…" : "保存标识"}
      </button>
      {error && <span role="alert" className="max-w-40 truncate text-xs text-rose-700">{error}</span>}
    </div>
  );
}
