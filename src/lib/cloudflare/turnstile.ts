type TurnstileVerification = {
  success?: boolean;
  action?: string;
  hostname?: string;
  metadata?: {
    result_with_testing_key?: boolean;
  };
};

export async function verifyTurnstileToken(
  request: Request,
  token: unknown,
  secret: string | undefined,
  expectedAction: string,
  allowedHostnames: string[] = [],
): Promise<boolean> {
  if (!secret || typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;
  const requestHostname = new URL(request.url).hostname;
  const hostnames = new Set(allowedHostnames.filter(Boolean));
  if (hostnames.size === 0) hostnames.add(requestHostname);

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    if (!response.ok) return false;
    const result = await response.json() as TurnstileVerification;
    if (result.success !== true) return false;
    // Cloudflare's official testing secret intentionally omits action/hostname.
    // Production responses must still pass both checks below.
    if (result.metadata?.result_with_testing_key === true) return true;
    return result.action === expectedAction
      && typeof result.hostname === 'string'
      && hostnames.has(result.hostname);
  } catch {
    return false;
  }
}
