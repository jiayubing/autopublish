import { createContext, useContext } from 'react';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

export type ConfirmationTone = 'default' | 'danger' | 'destructive' | 'warning';

export type ConfirmationOptions = {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  tone?: ConfirmationTone;
};

export type ConfirmationContextValue = {
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
};

export type ConfirmationPortalProps = {
  children: ReactNode;
  container?: HTMLElement | null;
};

export const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

export function useConfirmation(): ConfirmationContextValue {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error('useConfirmation must be used inside ConfirmationHost');
  }
  return context;
}

export function ConfirmationPortal({ children, container }: ConfirmationPortalProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, container || document.body);
}

export type ConfirmationHostFocusProps = {
  settingsTitleRef?: RefObject<HTMLElement | null>;
};
