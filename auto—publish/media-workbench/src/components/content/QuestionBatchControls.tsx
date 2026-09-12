import React, { useEffect, useState } from 'react';
import type { ClientGrouping } from './ClientSelector';
import ClientGroupBatchSelector from './ClientGroupBatchSelector';
import type { ContentClient, ContentCommandStaleResult, DoubaoBatchMode, DoubaoBatchPreview, DoubaoQueueState } from '../../types/content';
import { useConfirmation } from '../../confirmation';
import { isContentCommandStaleResult } from '../../content-command-result';

interface QuestionBatchControlsProps {
  clients: ContentClient[];
  grouping?: ClientGrouping;
  initialClientId: string;
  isCollecting: boolean;
  commands: {
    previewDoubaoBatch: (input: { clientIds: string[]; mode: DoubaoBatchMode }) => Promise<DoubaoBatchPreview | ContentCommandStaleResult>;
    startPreparedDoubaoBatch: (input: { clientIds: string[]; mode: DoubaoBatchMode }) => Promise<DoubaoQueueState | ContentCommandStaleResult>;
  };
  onError: (message: string) => void;
}

export default function QuestionBatchControls({ clients, grouping, initialClientId, isCollecting, commands, onError }: QuestionBatchControlsProps) {
  const { confirm } = useConfirmation();
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>(initialClientId ? [initialClientId] : []);
  const [batchPreview, setBatchPreview] = useState<DoubaoBatchPreview | null>(null);
  const [batchActionPending, setBatchActionPending] = useState(false);
  const clientIds = clients.map((client) => client.id);
  const selectedCount = selectedClientIds.filter((id) => clientIds.includes(id)).length;

  useEffect(() => {
    setSelectedClientIds((current) => current.filter((id) => clientIds.includes(id)));
  }, [clients]);

  function updateSelection(next: string[] | ((current: string[]) => string[])) {
    setSelectedClientIds(next);
    setBatchPreview(null);
  }

  async function startBatch(mode: DoubaoBatchMode) {
    if (isCollecting || batchActionPending) return;
    const selection = selectedClientIds.filter((id) => clientIds.includes(id));
    if (!selection.length) {
      onError('请先选择批次客户');
      return;
    }

    setBatchActionPending(true);
    try {
      const preview = await commands.previewDoubaoBatch({ clientIds: selection, mode });
      if (isContentCommandStaleResult(preview)) return;
      setBatchPreview(preview);
      if (!preview.taskCount) {
        onError('所选客户没有可采集的已启用问题');
        return;
      }

      if (mode === 'recollect') {
        const confirmed = await confirm({
          title: '重新采集选中客户',
          message: `将重新采集 ${preview.clientCount} 个客户的 ${preview.taskCount} 个问题。只有新回答成功后才会替换旧回答。`,
          confirmLabel: '开始重新采集',
          tone: 'warning',
        });
        if (!confirmed) return;
      }

      const result = await commands.startPreparedDoubaoBatch({
        clientIds: selection,
        mode,
      });
      if (isContentCommandStaleResult(result)) return;
    } catch (value) {
      const code = value && typeof value === 'object' && 'code' in value ? String(value.code) : '';
      onError(code === 'DOUBAO_PREVIEW_FAILED' ? '批次预览失败' : value instanceof Error ? value.message : '无法开始批量采集');
    } finally {
      setBatchActionPending(false);
    }
  }

  const batchActionBusy = isCollecting || batchActionPending;
  return <section className="rounded-md border border-slate-200 bg-white p-3">
    <div className="mb-3"><h2 className="text-sm font-semibold">批次客户</h2><p className="mt-1 text-xs text-slate-500">每轮采集为客户新开豆包对话，同一客户在本轮内共用，不读取历史对话。</p></div>
    <ClientGroupBatchSelector clients={clients} selectedIds={selectedClientIds} onChange={updateSelection} grouping={grouping} disabled={batchActionBusy} />
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" disabled={batchActionBusy || !selectedCount} onClick={() => void startBatch('missing')} className="collection-command-button rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">开始采集</button>
      <button type="button" disabled={batchActionBusy || !selectedCount} onClick={() => void startBatch('recollect')} className="collection-command-button rounded-md border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40">重新采集</button>
    </div>
    {batchPreview && <p className="mt-2 text-xs text-slate-500">预览：{batchPreview.clientCount} 个客户 · {batchPreview.taskCount} 个问题进入队列 · 跳过 {batchPreview.skippedExisting} 个已有回答 · 排除 {batchPreview.disabledQuestions} 个停用问题</p>}
  </section>;
}

