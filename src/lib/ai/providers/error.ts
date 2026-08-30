export async function providerErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.clone().json() as {
      error?: { message?: string } | string;
      message?: string;
      detail?: string;
    };
    const error = typeof payload.error === 'string' ? payload.error : payload.error?.message;
    const message = error || payload.message || payload.detail;
    if (message?.trim()) return message.trim().slice(0, 1000);
  } catch {
    // Some providers return plain text or an empty body.
  }
  return `HTTP ${response.status}`;
}
