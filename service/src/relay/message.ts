export type MessageResponse = Map<string, unknown> | Record<string, unknown>;

export function readMessageField(response: MessageResponse, name: string): unknown {
  return response instanceof Map ? response.get(name) : response[name];
}

export function normalizeMessageHash(hash: string): string {
  return hash.replace(/^0x/, "").toLowerCase();
}

export function shouldRememberRelayedHash(relaySucceeded: boolean): boolean {
  return relaySucceeded;
}
