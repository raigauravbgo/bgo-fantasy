export async function apiFetch<T>(
  url: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { error?: string }).error ?? `Request failed (${response.status})`
    );
  }
  return data as T;
}
