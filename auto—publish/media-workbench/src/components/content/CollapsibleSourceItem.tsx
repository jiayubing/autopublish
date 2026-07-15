import React, { useState } from 'react';

export interface CollapsibleSourceItemProps {
  id: string;
  title: string;
  summary: string;
  selected?: boolean;
  disabled?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export default function CollapsibleSourceItem({
  id,
  title,
  summary,
  selected = false,
  disabled = false,
  onSelectedChange,
  defaultExpanded = false,
  children,
  actions,
}: CollapsibleSourceItemProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = `source-content-${id}`;

  return <article className="rounded-md border border-slate-200 p-3">
    <div className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={(event) => onSelectedChange?.(event.target.checked)}
        aria-label={`选择${title}`}
        className="mt-1"
      />
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
        className="source-collapse-button min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-sm text-slate-800">{title}</span>
        <span className="mt-1 block truncate text-xs text-slate-500">{summary}</span>
      </button>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
    {expanded && <div id={contentId} className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">{children}</div>}
  </article>;
}
