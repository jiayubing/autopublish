const STALE_COMMAND_RESULT = Object.freeze({
  stale: true,
  code: 'CONTENT_COMMAND_STALE',
  reason: 'scope-changed',
});

export function staleContentCommandResult() {
  return STALE_COMMAND_RESULT;
}
