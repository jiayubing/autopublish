import type { ContentCommandStaleResult } from './types/content';

export function isContentCommandStaleResult(value: unknown): value is ContentCommandStaleResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'stale' in value &&
      value.stale === true &&
      'code' in value &&
      value.code === 'CONTENT_COMMAND_STALE',
  );
}
