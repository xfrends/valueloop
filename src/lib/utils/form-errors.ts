import type { ZodError } from 'zod';

export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string' || fieldErrors[field]) {
      continue;
    }

    fieldErrors[field] = issue.message;
  }

  return fieldErrors;
}

export function parseJsonRecord(value: string | null | undefined): Record<string, string> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).flatMap(([key, entry]) => {
        return typeof entry === 'string' && entry.trim() ? [[key, entry]] : [];
      })
    );
  } catch {
    return {};
  }
}
