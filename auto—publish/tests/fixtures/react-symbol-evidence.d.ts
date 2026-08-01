declare module "react" {
  export type ReactNode = unknown;
  export type FormEvent = unknown;
  export type RefObject<T> = { current: T | null };
  export type Context<T> = { Provider: unknown; __evidenceType?: T };
  export function createContext<T>(value: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
  export function useRef<T>(value: T): { current: T };
  export function useState<T>(value: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
  export function useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, dependencies: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, dependencies: readonly unknown[]): T;
  export function useSyncExternalStore<T>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T;
  export function lazy<T>(loader: () => Promise<T>): any;
  export const StrictMode: any;
  export const Suspense: any;
  const React: any;
  export default React;
}
