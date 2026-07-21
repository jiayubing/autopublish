function validRuntimeSnapshot(value) {
  return Boolean(value && typeof value.runtimeId === "string" && value.runtimeId && Number.isInteger(value.sequence) && value.sequence >= 0);
}

export function createGenerationRuntimeCursor() {
  let runtimeId = null;
  let sequence = -1;

  function bootstrap(snapshot) {
    if (!validRuntimeSnapshot(snapshot)) return false;
    if (snapshot.runtimeId === runtimeId && snapshot.sequence < sequence) return false;
    runtimeId = snapshot.runtimeId;
    sequence = snapshot.sequence;
    return true;
  }

  function accept(event) {
    if (!validRuntimeSnapshot(event) || runtimeId === null) return false;
    if (event.runtimeId !== runtimeId || event.sequence <= sequence) return false;
    sequence = event.sequence;
    return true;
  }

  function getState() {
    return { runtimeId, sequence };
  }

  return { bootstrap, accept, getState };
}
