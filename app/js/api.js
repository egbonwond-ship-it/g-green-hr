// API client + shared state.
const KEY = 'gg-hr-token';
export const state = { meta: null, lookups: {} };

export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return state._token; } };
export const setToken = (t) => { state._token = t; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

export async function api(path, { method = 'GET', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString() : '';
  const res = await fetch(`/api/${path}${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { 'x-gg-token': getToken() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 401 && path !== 'auth/login') { setToken(null); location.hash = '#/login'; }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export async function lookup(table, force) {
  if (!state.lookups[table] || force) state.lookups[table] = await api(`lookup/${table}`);
  return state.lookups[table];
}
export const clearLookups = () => { state.lookups = {}; };

export const role = () => state.meta?.user?.role;
export const isHR = () => ['admin', 'hr'].includes(role());
export const res = (k) => state.meta?.resources?.[k];
export const can = (k, action) => !!res(k)?.perms?.[action];
export const me = () => state.meta?.user?.employee_id;

export function money(v, opts = {}) {
  if (v == null || v === '') return '';
  const s = state.meta?.settings || { currency: 'NGN', locale: 'en-NG' };
  try {
    return new Intl.NumberFormat(s.locale || 'en-NG', { style: 'currency', currency: s.currency || 'NGN', maximumFractionDigits: opts.cents ? 2 : 0, notation: opts.compact ? 'compact' : 'standard' }).format(Number(v));
  } catch { return `${s.symbol || ''}${Number(v).toLocaleString()}`; }
}
export const num = (v, d = 0) => (v == null ? '' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }));
export function date(v) {
  if (!v) return '';
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
