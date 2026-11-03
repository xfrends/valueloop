/** Convert a D1 timestamp ("YYYY-MM-DD HH:MM:SS", UTC) or ISO string to ISO 8601, or null if unparseable. */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
