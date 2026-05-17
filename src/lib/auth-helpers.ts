const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a Better Auth text ID is a well-formed UUID before using it
 * in a domain table join. Returns null for missing, empty, or non-UUID values.
 */
export function authIdToUuid(id: string | null | undefined): string | null {
  if (!id) return null;
  if (!UUID_RE.test(id)) return null;
  return id;
}
