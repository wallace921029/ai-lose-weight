const TOKEN_KEY = 'pofu_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; [key: string]: unknown } = {},
): Promise<T> {
  // 约定：第二参数含 method/body 键时视为请求配置；有其他键视为 POST 数据体；空参数为 GET
  const hasKeys = Object.keys(opts).length > 0;
  const isReqOpts = 'method' in opts || 'body' in opts;
  const method = isReqOpts
    ? (opts.method as string | undefined) || (opts.body !== undefined ? 'POST' : 'GET')
    : hasKeys
      ? 'POST'
      : 'GET';
  const body = isReqOpts ? opts.body : hasKeys ? opts : undefined;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && method !== 'GET') headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* 非 JSON */
  }
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/')) {
      clearToken();
      location.href = '/login';
    }
    throw new ApiError(res.status, data?.error || '请求失败，请重试');
  }
  return data as T;
}

/** 任何写操作成功后广播刷新今日数据 */
export function refreshToday() {
  window.dispatchEvent(new Event('pofu:refresh'));
}
