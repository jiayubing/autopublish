import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ConfirmationContext,
  ConfirmationPortal,
  type ConfirmationHostFocusProps,
  type ConfirmationOptions,
  type ConfirmationRequester,
  type ConfirmationTone,
} from '../confirmation';

type FocusTarget = HTMLElement | null;

type PendingConfirmation = ConfirmationOptions & {
  id: number;
  requester: ConfirmationRequester;
  trigger: FocusTarget;
  fallback: FocusTarget;
  resolve: (approved: boolean) => void;
  settled: boolean;
  abortListener: (() => void) | null;
};

export type ConfirmationHostProps = ConfirmationHostFocusProps & {
  children: ReactNode;
  portalContainer?: HTMLElement | null;
  scopeKey?: string | number | null;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isConnectedElement(value: FocusTarget): value is HTMLElement {
  return Boolean(value && value.isConnected);
}

function scheduleFrame(callback: FrameRequestCallback): number {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(callback, 0);
}

function cancelScheduledFrame(frame: number) {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frame);
  } else {
    globalThis.clearTimeout(frame);
  }
}

function getSettingsTitle(trigger: FocusTarget): FocusTarget {
  if (!trigger) return null;
  const labelledContainer = trigger.closest<HTMLElement>('[aria-labelledby]');
  const labelledBy = labelledContainer?.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelledTitle = document.getElementById(labelledBy.split(/\s+/)[0]);
    if (labelledTitle instanceof HTMLElement) return labelledTitle;
  }
  return null;
}

function findFallbackTitle(): FocusTarget {
  const selector = [
    '[data-settings-title]',
    '[data-settings-heading]',
    '#settings-title',
    '#settings-heading',
    '#settings-overview-title',
  ].join(',');
  const title = document.querySelector<HTMLElement>(selector);
  return title instanceof HTMLElement ? title : null;
}

function focusElement(target: FocusTarget) {
  if (!isConnectedElement(target)) return;
  const hadTabIndex = target.hasAttribute('tabindex');
  if (!hadTabIndex) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  if (!hadTabIndex) {
    scheduleFrame(() => {
      if (target.isConnected && document.activeElement === target) target.removeAttribute('tabindex');
    });
  }
}

function restoreFocus(trigger: FocusTarget, fallback: FocusTarget) {
  if (isConnectedElement(trigger) && !trigger.hasAttribute('disabled')) {
    focusElement(trigger);
    return;
  }
  focusElement(fallback || findFallbackTitle());
}

function toneClasses(tone: ConfirmationTone | undefined) {
  if (tone === 'danger' || tone === 'destructive') {
    return {
      confirm: 'border border-rose-600 bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-200',
      icon: 'bg-rose-100 text-rose-700',
    };
  }
  if (tone === 'warning') {
    return {
      confirm: 'border border-amber-600 bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-200',
      icon: 'bg-amber-100 text-amber-700',
    };
  }
  return {
    confirm: 'border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-200',
    icon: 'bg-blue-100 text-blue-700',
  };
}

function ConfirmationDialog({
  pending,
  titleId,
  messageId,
  onConfirm,
  onCancel,
}: {
  pending: PendingConfirmation;
  titleId: string;
  messageId: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const classes = toneClasses(pending.tone);

  useEffect(() => {
    const frame = scheduleFrame(() => cancelRef.current?.focus());
    return () => cancelScheduledFrame(frame);
  }, [pending.id]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = event.currentTarget;
    const focusable = (Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)) as HTMLElement[]).filter(
      (element) => element.isConnected && !element.hidden && element.getAttribute('aria-hidden') !== 'true',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div data-confirmation-backdrop className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl outline-none"
      >
        <div className="flex items-start gap-3">
          <div aria-hidden="true" className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${classes.icon}`}>!</div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">{pending.title}</h2>
            <div id={messageId} className="mt-2 text-sm leading-6 text-slate-600">{pending.message}</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">取消</button>
          <button type="button" onClick={onConfirm} className={`rounded-md px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 ${classes.confirm}`}>{pending.confirmLabel || '确认'}</button>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmationHost({ children, portalContainer, settingsTitleRef, scopeKey = null }: ConfirmationHostProps) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);
  const queueRef = useRef<PendingConfirmation[]>([]);
  const nextIdRef = useRef(1);
  const mountedRef = useRef(true);
  const previousScopeRef = useRef(scopeKey);
  const activeScopeRef = useRef(scopeKey);
  const finishRequestRef = useRef<(request: PendingConfirmation, approved: boolean) => void>(() => undefined);
  const titleId = `confirmation-title-${useId().replace(/:/g, '')}`;
  const messageId = `confirmation-message-${useId().replace(/:/g, '')}`;

  const resolveRequest = useCallback((request: PendingConfirmation, approved: boolean) => {
    if (request.settled) return false;
    request.settled = true;
    if (request.signal && request.abortListener) {
      request.signal.removeEventListener('abort', request.abortListener);
    }
    request.abortListener = null;
    request.resolve(approved);
    return true;
  }, []);

  const finishRequest = useCallback((request: PendingConfirmation, approved: boolean) => {
    if (request.settled) return;
    if (pendingRef.current !== request) {
      const queuedIndex = queueRef.current.indexOf(request);
      if (queuedIndex < 0) return;
      queueRef.current.splice(queuedIndex, 1);
      resolveRequest(request, approved);
      return;
    }

    pendingRef.current = null;
    if (!resolveRequest(request, approved)) return;
    const next = queueRef.current.shift() || null;
    pendingRef.current = next;
    if (mountedRef.current) setPending(next);
    if (!next) {
      scheduleFrame(() => restoreFocus(request.trigger, request.fallback));
    }
  }, [resolveRequest]);
  finishRequestRef.current = finishRequest;

  const cancelAll = useCallback(() => {
    const requests = [pendingRef.current, ...queueRef.current].filter(
      (request): request is PendingConfirmation => Boolean(request),
    );
    pendingRef.current = null;
    queueRef.current = [];
    if (mountedRef.current) setPending(null);
    for (const request of requests) resolveRequest(request, false);
  }, [resolveRequest]);

  const setScopeKey = useCallback((nextScopeKey: string | null) => {
    const next = nextScopeKey || scopeKey;
    if (Object.is(activeScopeRef.current, next)) return;
    activeScopeRef.current = next;
    previousScopeRef.current = next;
    cancelAll();
  }, [cancelAll, scopeKey]);

  const request = useCallback((requester: ConfirmationRequester, options: ConfirmationOptions): Promise<boolean> => {
    if (options.signal?.aborted) return Promise.resolve(false);
    const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
    const trigger = activeElement instanceof HTMLElement ? activeElement : null;
    const fallback = settingsTitleRef?.current || getSettingsTitle(trigger) || findFallbackTitle();
    return new Promise<boolean>((resolve) => {
      const next: PendingConfirmation = {
        ...options,
        id: nextIdRef.current++,
        requester,
        trigger,
        fallback,
        resolve,
        settled: false,
        abortListener: null,
      };
      if (options.signal) {
        next.abortListener = () => finishRequestRef.current(next, false);
        options.signal.addEventListener('abort', next.abortListener, { once: true });
      }
      if (pendingRef.current) {
        queueRef.current.push(next);
      } else {
        pendingRef.current = next;
        if (mountedRef.current) setPending(next);
      }
      if (options.signal?.aborted) finishRequestRef.current(next, false);
    });
  }, [settingsTitleRef]);

  const cancelRequester = useCallback((requester: ConfirmationRequester) => {
    const ownedRequests = [pendingRef.current, ...queueRef.current].filter(
      (request): request is PendingConfirmation => Boolean(request && request.requester === requester),
    );
    for (const ownedRequest of ownedRequests) finishRequestRef.current(ownedRequest, false);
  }, []);

  useEffect(() => {
    if (Object.is(previousScopeRef.current, scopeKey)) return;
    previousScopeRef.current = scopeKey;
    activeScopeRef.current = scopeKey;
    cancelAll();
  }, [cancelAll, scopeKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAll();
    };
  }, [cancelAll]);

  const contextValue = useMemo(() => ({ request, cancelRequester, setScopeKey }), [cancelRequester, request, setScopeKey]);
  return (
    <ConfirmationContext.Provider value={contextValue}>
      {children}
      <ConfirmationPortal container={portalContainer}>
        {pending && <ConfirmationDialog pending={pending} titleId={titleId} messageId={messageId} onConfirm={() => finishRequest(pending, true)} onCancel={() => finishRequest(pending, false)} />}
      </ConfirmationPortal>
    </ConfirmationContext.Provider>
  );
}

export { ConfirmationHost };
export { ConfirmationPortal };
