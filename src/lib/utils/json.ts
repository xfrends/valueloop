export function parseJsonArray(value: string | null | undefined): unknown[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseTextList(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  const parsed = parseJsonArray(value);
  if (parsed.length > 0) {
    return parsed.flatMap((entry) => typeof entry === 'string' && entry.trim() ? [entry.trim()] : []);
  }

  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean);
}

export function parseJsonObject<T extends Record<string, unknown>>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}
