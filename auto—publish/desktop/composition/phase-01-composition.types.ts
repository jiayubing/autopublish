export interface OperationalStorePort {
  readonly phase: "not-implemented-until-phase-02";
}

export interface PublisherPort {
  inspectAccount(): Promise<unknown>;
  publish(input: unknown, signal: AbortSignal): Promise<unknown>;
}

export interface PublicationWorkflowPort {
  publish(command: unknown): Promise<unknown>;
  recover(): Promise<unknown>;
}
