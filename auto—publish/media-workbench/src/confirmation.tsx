import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

export type ConfirmationTone = 'default' | 'danger' | 'destructive' | 'warning';

export type ConfirmationOptions = {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  tone?: ConfirmationTone;
  signal?: AbortSignal;
};

export type ConfirmationContextValue = {
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
};

export type ConfirmationRequester = object;

export type ConfirmationHostContextValue = {
  request: (requester: ConfirmationRequester, options: ConfirmationOptions) => Promise<boolean>;
  cancelRequester: (requester: ConfirmationRequester) => void;
};

export type ConfirmationPortalProps = {
  children: ReactNode;
  container?: HTMLElement | null;
};

export const ConfirmationContext = createContext<ConfirmationHostContextValue | null>(null);

export function useConfirmation(): ConfirmationContextValue {
  const context = useContext(ConfirmationContext);
  const requesterRef = useRef<ConfirmationRequester>({});
  const requester = requesterRef.current;
  const confirm = useCallback((options: ConfirmationOptions) => {
    if (!context) throw new Error('useConfirmation must be used inside ConfirmationHost');
    return context.request(requester, options);
  }, [context, requester]);
  useEffect(() => {
    if (!context) return;
    return () => context.cancelRequester(requester);
  }, [context, requester]);
  const value = useMemo(() => ({ confirm }), [confirm]);
  if (!context) {
    throw new Error('useConfirmation must be used inside ConfirmationHost');
  }
  return value;
}

export function ConfirmationPortal({ children, container }: ConfirmationPortalProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, container || document.body);
}

export type ConfirmationHostFocusProps = {
  settingsTitleRef?: RefObject<HTMLElement | null>;
};
