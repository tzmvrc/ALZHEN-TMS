export type CreationRequest = { payload: string; id: string };

/**
 * Keep the same creation request only while the saved contents are identical.
 * An unchanged retry replays the original transaction (no duplicate trip); an
 * edited draft must never reuse an identity the server already sealed.
 */
export function nextCreationRequest(
  previous: CreationRequest,
  payload: unknown,
  createId: () => string = () => crypto.randomUUID(),
): CreationRequest {
  const serialized = JSON.stringify(payload);
  return serialized === previous.payload ? previous : { payload: serialized, id: createId() };
}
