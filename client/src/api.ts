// Если VITE_API_URL не задан — считаем, что клиент отдаётся тем же сервером
// (деплой одним web-сервисом), и обращаемся по тому же origin.
const API_URL = (import.meta.env.VITE_API_URL as string) || "";

async function request(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Ошибка запроса: ${res.status}`);
  return res.json();
}

export const api = {
  getMe: (token: string) => request("/api/users/me", token),
  updateMe: (token: string, data: { displayName?: string; avatar?: string; about?: string }) =>
    request("/api/users/me", token, { method: "PATCH", body: JSON.stringify(data) }),
  listUsers: (token: string) => request("/api/users", token),
};
