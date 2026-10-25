export class AuthError extends Error {}

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Requested-With": "sigui" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AuthError("Nicht angemeldet");
  if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
  return data;
}
