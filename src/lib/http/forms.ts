const formDataCache = new WeakMap<Request, Promise<FormData>>();

async function getCachedFormData(request: Request): Promise<FormData> {
  let cached = formDataCache.get(request);
  if (!cached) {
    cached = request.formData();
    formDataCache.set(request, cached);
  }

  return cached;
}

export async function readFormDataValue(request: Request, key: string): Promise<string> {
  try {
    const contentType = request.headers.get('content-type') || '';
    const method = request.method.toUpperCase();

    if (method === 'GET') {
      return '';
    }

    if (
      !contentType.includes('application/x-www-form-urlencoded') &&
      !contentType.includes('multipart/form-data') &&
      !contentType.includes('text/plain')
    ) {
      return '';
    }

    const formData = await getCachedFormData(request);
    return String(formData.get(key) ?? '').trim();
  } catch {
    return '';
  }
}

export async function readJsonBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
