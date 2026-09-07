/**
 * Thin fetch wrapper. Everything goes through the same-origin /api prefix, and cookies
 * carry the session, so there is no token handling on the client at all.
 */

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error || `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload ?? {};
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const text = await res.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text.slice(0, 200) };
  }

  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};

/** Sent with anything time-of-day shaped so the server uses the viewer's clock. */
export const tzOffset = () => new Date().getTimezoneOffset();

export const api = {
  me: () => request('/auth/me'),
  requestCode: (email, name) => request('/auth/request-code', { method: 'POST', body: { email, name } }),
  verifyCode: (email, code) => request('/auth/verify', { method: 'POST', body: { email, code } }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  feed: () => request('/matches/feed'),
  search: (params) => request(`/matches/search${qs(params)}`),
  history: (params) => request(`/matches/history${qs(params)}`),
  seasons: () => request('/matches/seasons'),
  match: (id) => request(`/matches/${id}`),
  addCustom: (data) => request('/matches/custom', { method: 'POST', body: data }),
  deleteCustom: (id) => request(`/matches/${id}`, { method: 'DELETE' }),

  teams: () => request('/catalog/teams'),
  competitions: () => request('/catalog/competitions'),
  filters: () => request('/catalog/filters'),
  setFollow: (kind, id, following) =>
    request('/catalog/follows', { method: 'PUT', body: { kind, id, following } }),
  suggestions: () => request('/catalog/suggestions'),
  followMany: (teams, competitions) =>
    request('/catalog/follows/bulk', { method: 'POST', body: { teams, competitions } }),

  saveLog: (matchId, data) => request(`/logs/${matchId}`, { method: 'PUT', body: data }),
  removeLog: (matchId) => request(`/logs/${matchId}`, { method: 'DELETE' }),

  stats: (season) => request(`/stats${qs({ season, tzOffset: tzOffset() })}`),
  exportCount: (scope) => request(`/export/count${qs({ scope })}`),

  // Admin-only. Every one of these answers 404 for anyone else.
  syncStatus: () => request('/admin/sync'),
  adminOverview: () => request('/admin/overview'),
  adminUsers: () => request('/admin/users'),
  runSync: (job, max) => request('/admin/sync/run', { method: 'POST', body: { job, max } }),
  revokeSessions: (id) => request(`/admin/users/${id}/revoke`, { method: 'POST' }),
  deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
};

/** URL for the export download; the browser handles it as a normal navigation. */
export function exportUrl({ scope, format, tz }) {
  return `/api/export${qs({ scope, format, tz, tzOffset: tzOffset() })}`;
}
