import React, { useEffect, useState } from "react";
import type {
  ContentClient,
  ContentCommandStaleResult,
  LiejuPublicationProfile,
} from "../../types/content";
import { isContentCommandStaleResult } from "../../content-command-result";

const EMPTY_PROFILE: LiejuPublicationProfile = {
  city: "",
  contact: "",
  phone: "",
};

function profileForClient(client?: ContentClient): LiejuPublicationProfile {
  return {
    ...EMPTY_PROFILE,
    ...(client?.publicationProfiles?.lieju || {}),
  };
}

interface ClientLiejuPublicationProfileEditorProps {
  client?: ContentClient;
  saveProfile: (input: {
    clientId: string;
    profile: LiejuPublicationProfile;
  }) => Promise<LiejuPublicationProfile | ContentCommandStaleResult>;
}

export default function ClientLiejuPublicationProfileEditor({
  client,
  saveProfile,
}: ClientLiejuPublicationProfileEditorProps) {
  const [draft, setDraft] = useState<LiejuPublicationProfile>(() =>
    profileForClient(client),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(profileForClient(client));
    setDirty(false);
    setMessage("");
  }, [
    client?.id,
    client?.publicationProfiles?.lieju?.city,
    client?.publicationProfiles?.lieju?.contact,
    client?.publicationProfiles?.lieju?.phone,
  ]);

  if (!client) return null;

  function update(field: keyof LiejuPublicationProfile, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setMessage("");
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const saved = await saveProfile({ clientId: client.id, profile: draft });
      if (isContentCommandStaleResult(saved)) return;
      setDraft(saved);
      setDirty(false);
      setMessage("已保存");
    } catch (value) {
      setMessage(value instanceof Error ? value.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const configured = Boolean(draft.city.trim() || draft.contact.trim() || draft.phone.trim());

  return (
    <details className="min-w-0 rounded-md border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs text-slate-700">
        <span className="font-semibold">列举网投递档案</span>
        <span className="ml-2 text-slate-500">
          当前客户：{client.name} · {configured ? "已配置" : "未配置"}
        </span>
      </summary>
      <div className="border-t border-slate-100 px-3 py-3">
        <p className="mb-2 text-xs text-slate-500">
          编辑当前客户的投稿信息；保存到客户档案，不会修改任何文章标题或正文。
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-slate-600">
            城市
            <input
              aria-label={`${client.name} 列举网城市`}
              maxLength={100}
              value={draft.city}
              onChange={(event) => update("city", event.target.value)}
              className="mt-1 h-8 w-full rounded border border-slate-300 px-2"
            />
          </label>
          <label className="text-xs text-slate-600">
            联系人
            <input
              aria-label={`${client.name} 列举网联系人`}
              maxLength={100}
              value={draft.contact}
              onChange={(event) => update("contact", event.target.value)}
              className="mt-1 h-8 w-full rounded border border-slate-300 px-2"
            />
          </label>
          <label className="text-xs text-slate-600">
            电话
            <input
              aria-label={`${client.name} 列举网电话`}
              maxLength={50}
              value={draft.phone}
              onChange={(event) => update("phone", event.target.value)}
              className="mt-1 h-8 w-full rounded border border-slate-300 px-2"
            />
          </label>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            role={message && message !== "已保存" ? "alert" : "status"}
            className={`text-xs ${message === "已保存" ? "text-emerald-600" : "text-rose-600"}`}
          >
            {message}
          </span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="rounded border border-blue-300 px-3 py-1 text-xs text-blue-700 disabled:opacity-40"
          >
            {saving ? "保存中…" : "保存档案"}
          </button>
        </div>
      </div>
    </details>
  );
}
