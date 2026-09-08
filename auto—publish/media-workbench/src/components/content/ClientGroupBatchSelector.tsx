import React, { useMemo } from 'react';
import type { ContentClient } from '../../types/content';
import { ClientSelection, type ClientGrouping } from './ClientSelector';

interface ClientGroupOption {
  id: string;
  name: string;
  clientIds: string[];
}

interface ClientGroupBatchSelectorProps {
  clients: ContentClient[];
  grouping?: ClientGrouping;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

const chip = 'rounded-md border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

export function clientGroupOptions(clients: ContentClient[], grouping?: ClientGrouping): ClientGroupOption[] {
  if (!grouping || grouping.error) return [];
  const membership = new Map(grouping.catalog.memberships.map((item) => [item.clientId, item.groupId] as const));
  const knownGroups = new Set(grouping.catalog.groups.map((group) => group.id));
  const options = grouping.catalog.groups.map((group) => ({
    id: group.id,
    name: group.name,
    clientIds: clients.filter((client) => membership.get(client.id) === group.id).map((client) => client.id),
  }));
  const ungrouped = clients
    .filter((client) => {
      const groupId = membership.get(client.id);
      return !groupId || !knownGroups.has(groupId);
    })
    .map((client) => client.id);
  if (ungrouped.length) options.push({ id: 'ungrouped', name: '未分组', clientIds: ungrouped });
  return options;
}

export function selectedClientGroup(clients: ContentClient[], grouping: ClientGrouping | undefined, selectedIds: string[]) {
  const available = new Set(clients.map((client) => client.id));
  const selected = selectedIds.filter((id) => available.has(id));
  if (!selected.length) return null;
  return clientGroupOptions(clients, grouping).find((option) => option.clientIds.length > 0 && sameIds(option.clientIds, selected)) || null;
}

export default function ClientGroupBatchSelector({ clients, grouping, selectedIds, onChange, disabled = false }: ClientGroupBatchSelectorProps) {
  const options = useMemo(() => clientGroupOptions(clients, grouping), [clients, grouping?.catalog, grouping?.error]);
  const active = useMemo(() => selectedClientGroup(clients, grouping, selectedIds), [clients, grouping, selectedIds]);
  const selectedCount = selectedIds.filter((id) => clients.some((client) => client.id === id)).length;

  return <div className="space-y-3" data-client-group-batch-selector>
    <div className="rounded-md border border-blue-100 bg-blue-50/50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-800">按分组直接选择</h3>
          <p className="mt-1 text-xs text-slate-500">分组名称完全自定义。大多数时候点一个组即可，只有特殊情况再逐个调整客户。</p>
        </div>
        {active && <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700">当前：{active.name} · {active.clientIds.length} 个</span>}
        {!active && selectedCount > 0 && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">当前：自定义选择 · {selectedCount} 个</span>}
      </div>
      {grouping?.loading && <p role="status" className="mt-3 text-xs text-slate-500">正在加载客户分组…</p>}
      {grouping?.error && <p role="status" className="mt-3 text-xs text-amber-800">客户分组暂不可用，可继续使用下方的客户选择。</p>}
      {!grouping?.loading && !grouping?.error && <div className="mt-3 flex flex-wrap gap-2" aria-label="客户分组快捷选择">
        {options.length ? options.map((option) => {
          const pressed = active?.id === option.id;
          return <button
            type="button"
            key={option.id}
            aria-pressed={pressed}
            disabled={disabled || option.clientIds.length === 0}
            onClick={() => onChange([...option.clientIds])}
            className={`${chip} ${pressed ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`}
          >
            {option.name} <span className={pressed ? 'text-blue-100' : 'text-slate-400'}>({option.clientIds.length})</span>
          </button>;
        }) : <p className="text-xs text-slate-500">还没有分组。可先用下方“选择客户 → 管理分组”创建自定义分组。</p>}
      </div>}
    </div>

    <div className="rounded-md border border-dashed border-slate-200 p-3">
      <div className="mb-2">
        <h3 className="text-xs font-semibold text-slate-700">需要临时挑选？</h3>
        <p className="mt-1 text-xs text-slate-500">只想处理组内部分客户，或跨组组合时，再使用这里的详细选择。</p>
      </div>
      <ClientSelection clients={clients} selectedIds={selectedIds} onChange={onChange} grouping={grouping} disabled={disabled} />
    </div>
  </div>;
}
