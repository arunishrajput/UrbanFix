export const formatRef = (refNo: number) => `UF-${String(refNo).padStart(6, '0')}`;

/** Parses "UF-000123" (or "123") into a ref number. */
export function parseRef(input: string): number | null {
  const m = /^(?:uf-?)?0*(\d{1,9})$/i.exec(input.trim());
  return m ? Number(m[1]) : null;
}

export const iso = (d: Date | string | null | undefined): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString() : new Date(d).toISOString();

export const isoOrNow = (d: Date | string | null | undefined): string => iso(d) ?? new Date().toISOString();

/** "Priya Sharma" → "PS"; guests → "G". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
}

/** Public display name: first name + last initial. */
export function publicName(name: string, isGuest: boolean): string {
  if (isGuest) return 'Guest citizen';
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : parts[0]!;
}

export function encodeCursor(values: (string | number)[]): string {
  return Buffer.from(JSON.stringify(values)).toString('base64url');
}

export function decodeCursor<T extends unknown[]>(cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}
