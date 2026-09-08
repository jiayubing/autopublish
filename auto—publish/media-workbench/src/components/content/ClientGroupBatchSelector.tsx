import React from 'react';
import type { ContentClient } from '../../types/content';
import { ClientGroupManagerButton, ClientSelection, type ClientGrouping } from './ClientSelector';

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
  describeClient?: (client: ContentClient) => React.ReactNode;
}

const MAX_INLINE_GROUPS = 5;
const chip = 'rounded-md border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';
const select = 'rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40';

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

function visibleGroupOptions(options: ClientGroupOption[], active: ClientGroupOption | null) {
  if (options.length <= MAX_INLINE_GROUPS) return options;
  const first = options.slice(0, MAX_INLINE_GROUPS);
  if (!active || first.some((option) => option.id === active.id)) return first;
  return [...options.slice(0, MAX_INLINE_GROUPS - 1), active];
}

export default function ClientGroupBatchSelector({ clients, grouping, selectedIds, onChange, disabled = false, describeClient }: ClientGroupBatchSelectorProps) {
  const options = clientGroupOptions(clients, grouping);
  const active = selectedClientGroup(clients, grouping, selectedIds);
  const visibleOptions = visibleGroupOptions(options, active);
  const visibleIds = new Set(visibleOptions.map((option) => option.id));
  const overflowOptions = options.filter((option) => !visibleIds.has(option.id));
  const selectedSet = new Set(selectedIds);
  const selectedClients = clients.filter((client) => selectedSet.has(client.id));
  const selectedCount = selectedClients.length;
  const selectedNames = selectedClients.slice(0, 3).map((client) => client.name).join('、');
  const selectionLabel = active
    ? `${active.name} · ${active.clientIds.length} 个客户`
    : selectedCount
      ? `自定义选择 · ${selectedCount} 个客户`
      : '尚未选择客户';
  const selectionDetail = selectedCount
    ? `${selectedNames}${selectedCount > 3 ? ` 等 ${selectedCount} 个` : ''}`
    : '可直接点一个分组，或选择部分客户。';

  return <div className="space-y-3" data-client-group-batch-selector>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-xs font-semibold text-slate-800">选择范围</h3>
        <p className="mt-1 text-xs text-slate-500">点分组即可选择整组；只有特殊情况再逐个选择客户。</p>
      </div>
      {grouping && <ClientGroupManagerButton clients={clients} grouping={grouping} disabled={disabled} />}
    </div>

    {grouping?.loading && <p role="status" className="text-xs text-slate-500">正在加载客户分组…</p>}
    {grouping?.error && <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-amber-800"><span>客户分组暂不可用，可继续选择具体客户。</span><button type="button" onClick={grouping.reload} disabled={grouping.loading} className={select}>重试分组</button></div>}

    {!grouping?.loading && !grouping?.error && <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label="客户分组快捷选择">
      {visibleOptions.map((option) => {
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
      })}
      {overflowOptions.length > 0 && <select
        aria-label="更多客户分组"
        defaultValue=""
        disabled={disabled}
        onChange={(event) => {
          const option = options.find((item) => item.id === event.target.value);
          if (option) onChange([...option.clientIds]);
          event.currentTarget.value = '';
        }}
        className={select}
      >
        <option value="">更多分组…</option>
        {overflowOptions.map((option) => <option key={option.id} value={option.id} disabled={!option.clientIds.length}>{option.name}（{option.clientIds.length}）</option>)}
      </select>}
      {!options.length && <span className="text-xs text-slate-500">暂无可用分组。</span>}
      <ClientSelection
        clients={clients}
        selectedIds={selectedIds}
        onChange={onChange}
        grouping={grouping}
        disabled={disabled}
        describeClient={describeClient}
        allowManage={false}
        triggerLabel="选择部分客户…"
        showSummary={false}
      />
    </div>}

    {(grouping?.loading || grouping?.error) && <ClientSelection
      clients={clients}
      selectedIds={selectedIds}
      onChange={onChange}
      grouping={grouping}
      disabled={disabled}
      describeClient={describeClient}
      allowManage={false}
      triggerLabel="选择部分客户…"
      showSummary={false}
    />}

    <div role="status" className="min-w-0 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span>已选：</span><span className="font-semibold text-slate-800">{selectionLabel}</span>
      <span className="ml-2 text-slate-500">{selectionDetail}</span>
    </div>
  </div>;
}
