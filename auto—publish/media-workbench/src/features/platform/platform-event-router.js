export function routePlatformTransportEvent(value, consume, report) {
  if (value && value.kind === "transport-diagnostic") {
    report("PLATFORM_EVENT_TRANSPORT_REJECTED", "platform-event");
    return;
  }
  consume(value);
}

