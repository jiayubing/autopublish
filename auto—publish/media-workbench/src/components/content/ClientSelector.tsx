import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientGroupCatalog, ClientGroupChange, ContentClient } from '../../types/content';
import { isContentCommandStaleResult } from '../../content-command-result';

export interface ClientGrouping {
  catalog: {
    revision: number;
    groups: ReadonlyArray<ClientGroupCatalog['groups'][number]>;
    memberships: ReadonlyArray<ClientGroupCatalog['memberships'][number]>;
  };
  loading: boolean;
  busy: boolean;
  error?: string;
  reload: () => void;
  update: (input: ClientGroupChange) => Promise<unknown>;
}

const PAGE_SIZE = 50;
const EMPTY_CATALOG: ClientGroupCatalog = { revision: 0, groups: [], memberships: [] };
const control = 'min-w-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs disabled:opacity-40';
const button = `${control} hover:bg-slate-50`;

function useClientFilter(clients: ContentClient[], grouping?: ClientGrouping) {
  const [groupId, setGroupId] = useState('');
  const [search, setSearch] = useState('');
  const catalog = grouping?.catalog || EMPTY_CATALOG;
  const names = useMemo(() => new Map<string, string>(catalog.groups.map((group) => [group.id, group.name] as const)), [catalog]);
  const membership = useMemo(() => new Map<string, string>(catalog.memberships.map((member) => [member.clientId, member.groupId] as const)), [catalog]);
  const groupFor = (client: ContentClient) => names.has(membership.get(client.id)) ? membership.get(client.id) : undefined;
  const effectiveGroup = grouping?.error || (groupId !== 'ungrouped' && !names.has(groupId)) ? '' : groupId;
  const query = search.trim().toLowerCase();
  const matched = clients.filter((client) => {
    const memberGroup = groupFor(client);
    return (!effectiveGroup || (effectiveGroup === 'ungrouped' ? !memberGroup : memberGroup === effectiveGroup)) &&
      (!query || client.name.toLowerCase().includes(query) || client.id.toLowerCase().includes(query));
  });
  const counts = new Map<string, number>();
  clients.forEach((client) => {
    const key = groupFor(client) || 'ungrouped';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  useEffect(() => {
    if (groupId && groupId !== 'ungrouped' && !names.has(groupId)) setGroupId('');
  }, [groupId, names]);
  return { groupId: effectiveGroup, setGroupId, search, setSearch, matched, counts, groupName: (client: ContentClient) => names.get(groupFor(client)) || '未分组' };
}

type FilterState = ReturnType<typeof useClientFilter>;
function ClientFilters({ clients, grouping, filter, label, disabled, allowManage = true, onFilterChange }: {
  clients: ContentClient[]; grouping?: ClientGrouping; filter: FilterState; label: string;
  disabled?: boolean; allowManage?: boolean; onFilterChange?: () => void;
}) {
  const [managing, setManaging] = useState(false);
  return <>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <select aria-label={`${label}分组`} value={filter.groupId} disabled={disabled || grouping?.loading || Boolean(grouping?.error)} onChange={(event) => { filter.setGroupId(event.target.value); onFilterChange?.(); }} className={`${control} max-w-56`}>
        <option value="">全部客户（{clients.length}）</option>
        {(grouping?.catalog.groups || []).map((group) => <option key={group.id} value={group.id}>{group.name}（{filter.counts.get(group.id) || 0}）</option>)}
        <option value="ungrouped">未分组（{filter.counts.get('ungrouped') || 0}）</option>
      </select>
      <input aria-label={`搜索${label}`} type="search" value={filter.search} disabled={disabled} onChange={(event) => { filter.setSearch(event.target.value); onFilterChange?.(); }} placeholder="搜索客户名称" className={`${control} w-44 max-w-full`} />
      {grouping && allowManage && <button type="button" onClick={() => setManaging(true)} disabled={disabled || grouping.loading || Boolean(grouping.error)} className={button}>管理分组</button>}
    </div>
    {grouping?.loading && <p role="status" className="text-xs text-slate-500">正在加载客户分组…</p>}
    {grouping?.error && <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-amber-800"><span>客户分组暂不可用，可搜索全部客户。</span><button type="button" onClick={grouping.reload} disabled={grouping.loading} className={button}>重试分组</button></div>}
    {managing && grouping && <ClientGroupManager clients={clients} grouping={grouping} onClose={() => setManaging(false)} />}
  </>;
}

export function ClientSelection({ clients, selectedIds, onChange, grouping, disabled = false, describeClient, allowManage = true }: {
  clients: ContentClient[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  grouping?: ClientGrouping;
  disabled?: boolean;
  describeClient?: (client: ContentClient) => React.ReactNode;
  allowManage?: boolean;
}) {
  const filter = useClientFilter(clients, grouping);
  const [showSelected, setShowSelected] = useState(false);
  const [page, setPage] = useState(1);
  const selected = new Set(selectedIds);
  const selectedClients = clients.filter((client) => selected.has(client.id));
  const matchedIds = new Set(filter.matched.map((client) => client.id));
  const hiddenCount = selectedClients.filter((client) => !matchedIds.has(client.id)).length;
  const rows = showSelected ? selectedClients : filter.matched;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const changeFilter = () => { setPage(1); setShowSelected(false); };
  return <div className="min-w-0 space-y-2" data-client-selection>
    <ClientFilters clients={clients} grouping={grouping} filter={filter} label="批次客户" disabled={disabled} allowManage={allowManage} onFilterChange={changeFilter} />
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={disabled || !filter.matched.length} onClick={() => onChange([...new Set([...selectedClients.map((client) => client.id), ...matchedIds])])} className={button}>全选当前结果（{filter.matched.length}）</button>
      <button type="button" disabled={disabled || !selectedClients.length} onClick={() => onChange([])} className={button}>清空选择</button>
      <button type="button" aria-pressed={showSelected} onClick={() => { setShowSelected(!showSelected); setPage(1); }} className={button}>{showSelected ? '返回筛选结果' : '查看已选'}</button>
    </div>
    <p role="status" className="text-xs text-slate-600">已选 {selectedClients.length} 个客户{hiddenCount > 0 && `，其中 ${hiddenCount} 个不在当前筛选结果中`}{showSelected && '；正在查看全部已选客户'}</p>
    <div className="h-64 overflow-y-auto rounded border border-slate-200 bg-white divide-y divide-slate-100">
      {!visible.length && <p className="p-4 text-xs text-slate-500">{showSelected ? '尚未选择客户' : !clients.length ? '暂无客户，请添加客户资料后刷新。' : '没有匹配客户，请调整分组或搜索条件。'}</p>}
      {visible.map((client) => <label key={client.id} className="flex min-w-0 items-start gap-2 px-3 py-2 text-xs hover:bg-slate-50">
        <input type="checkbox" aria-label={client.name} checked={selected.has(client.id)} disabled={disabled} onChange={(event) => onChange(event.target.checked ? [...new Set([...selectedClients.map((item) => item.id), client.id])] : selectedClients.filter((item) => item.id !== client.id).map((item) => item.id))} className="mt-0.5 shrink-0" />
        <span className="min-w-0 flex-1 break-words"><span className="block text-slate-800">{client.name}</span>{describeClient && <span className="block text-slate-500">{describeClient(client)}</span>}</span>
        <span className="max-w-32 shrink-0 break-words text-slate-500">{filter.groupName(client)}</span>
      </label>)}
    </div>
    {pages > 1 && <div className="flex items-center justify-end gap-2 text-xs text-slate-500"><span>{rows.length} 个客户 · 第 {currentPage}/{pages} 页</span><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={button}>上一页</button><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className={button}>下一页</button></div>}
  </div>;
}

export function CurrentClientSelector({ clients, clientId, onChange, grouping }: {
  clients: ContentClient[]; clientId: string; onChange: (id: string) => void; grouping?: ClientGrouping;
}) {
  const filter = useClientFilter(clients, grouping);
  const current = clients.find((client) => client.id === clientId);
  const currentOutside = current && !filter.matched.some((client) => client.id === clientId);
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <ClientFilters clients={clients} grouping={grouping} filter={filter} label="客户" />
    <label className="flex min-w-0 items-center gap-2 text-xs text-slate-500">当前客户
      <select aria-label="当前客户" value={clientId} onChange={(event) => onChange(event.target.value)} className={`${control} w-48 max-w-full`}>
        <option value="" disabled={clients.length > 0}>{clients.length ? '请选择客户' : '暂无客户'}</option>
        {currentOutside && <option value={current.id}>当前：{current.name}（筛选外）</option>}
        {filter.matched.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        {!filter.matched.length && clients.length > 0 && <option disabled>没有匹配客户</option>}
      </select>
    </label>
  </div>;
}

function ClientGroupManager({ clients, grouping, onClose }: { clients: ContentClient[]; grouping: ClientGrouping; onClose: () => void }) {
  const [deleteRequested, setDeleteRequested] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [renameName, setRenameName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [destinationId, setDestinationId] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const editing = grouping.catalog.groups.find((group) => group.id === editingId);
  const busy = saving || grouping.busy;
  const unavailable = busy || grouping.loading || Boolean(grouping.error);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => { setRenameName(editing?.name || ''); setDeleteRequested(false); }, [editing?.id, editing?.name]);
  useEffect(() => {
    if (editingId && !editing) setEditingId('');
    if (destinationId && !grouping.catalog.groups.some((group) => group.id === destinationId)) setDestinationId('');
    const available = new Set(clients.map((client) => client.id));
    setSelectedIds((current) => current.filter((id) => available.has(id)));
  }, [clients, editingId, editing, destinationId, grouping.catalog]);

  async function save(input: ClientGroupChange) {
    if (savingRef.current || unavailable) return false;
    savingRef.current = true;
    setSaving(true); setError(''); setFeedback('');
    try {
      const result = await grouping.update(input);
      if (isContentCommandStaleResult(result) || (result && typeof result === 'object' && 'ignored' in result)) return false;
      setFeedback('客户分组已保存。');
      return true;
    } catch (value) {
      setError(value instanceof Error ? value.message : '分组操作失败，请刷新后重试。');
      return false;
    } finally { savingRef.current = false; setSaving(false); }
  }

  return <dialog ref={dialogRef} aria-label="管理客户分组" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} className="m-auto max-h-[90vh] w-11/12 max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl backdrop:bg-black/30">
    <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">管理客户分组</h2><button type="button" onClick={onClose} disabled={busy} className={button}>完成</button></div>
    <p className="mb-3 text-xs text-slate-500">一个客户只属于一个分组；移动分组不会移动客户资料或改变任务。</p>
    {error && <p role="alert" className="mb-3 text-xs text-rose-700">{error}</p>}
    {feedback && <p role="status" className="mb-3 text-xs text-emerald-700">{feedback}</p>}
    {grouping.error && <div role="status" className="mb-3 text-xs text-amber-800">{grouping.error} <button type="button" onClick={grouping.reload} disabled={busy || grouping.loading} className={button}>重试分组</button></div>}
    <form className="mb-3 flex flex-wrap gap-2" onSubmit={async (event) => { event.preventDefault(); if (await save({ action: 'create', revision: grouping.catalog.revision, name: newName })) setNewName(''); }}>
      <input aria-label="新分组名称" value={newName} maxLength={40} onChange={(event) => setNewName(event.target.value)} placeholder="新分组名称，如：重点推进" disabled={unavailable} className={`${control} w-56`} />
      <button type="submit" disabled={unavailable || !newName.trim()} className={button}>新建分组</button>
    </form>
    <div className="mb-4 flex flex-wrap gap-2">
      <select aria-label="要编辑的分组" value={editing?.id || ''} onChange={(event) => setEditingId(event.target.value)} disabled={unavailable} className={`${control} max-w-56`}><option value="">选择要编辑的分组</option>{grouping.catalog.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
      <input aria-label="分组新名称" value={renameName} maxLength={40} onChange={(event) => setRenameName(event.target.value)} disabled={unavailable || !editing} className={`${control} w-40`} />
      <button type="button" disabled={unavailable || !editing || !renameName.trim() || renameName.trim() === editing.name} onClick={() => void save({ action: 'rename', revision: grouping.catalog.revision, groupId: editing.id, name: renameName })} className={button}>保存名称</button>
      <button type="button" disabled={unavailable || !editing} onClick={() => setDeleteRequested(true)} className={`${button} text-rose-700`}>删除分组</button>
    </div>
    {deleteRequested && editing && <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs">
      <p>删除“{editing.name}”后，组内客户将回到未分组。不会删除客户、资料或文章，也不会改变已启动的批次。</p>
      <div className="mt-2 flex gap-2"><button type="button" disabled={unavailable} onClick={() => void save({ action: 'delete', revision: grouping.catalog.revision, groupId: editing.id })} className={button}>确认删除分组</button><button type="button" disabled={busy} onClick={() => setDeleteRequested(false)} className={button}>取消删除</button></div>
    </div>}
    <h3 className="mb-2 text-xs font-semibold">批量移动客户</h3>
    <ClientSelection clients={clients} selectedIds={selectedIds} onChange={setSelectedIds} grouping={grouping} disabled={unavailable} allowManage={false} />
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <label className="text-xs">移入分组 <select aria-label="移入分组" value={destinationId} onChange={(event) => setDestinationId(event.target.value)} disabled={unavailable} className={`${control} max-w-56`}><option value="">未分组</option>{grouping.catalog.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <button type="button" disabled={unavailable || !selectedIds.length} onClick={async () => { if (await save({ action: 'assign', revision: grouping.catalog.revision, groupId: destinationId || null, clientIds: [...selectedIds] })) setSelectedIds([]); }} className={button}>移动选中客户（{selectedIds.length}）</button>
    </div>
  </dialog>;
}
