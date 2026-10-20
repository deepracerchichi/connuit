// The backend's address. Forgiving about how it was typed in the hosting dashboard: without a
// scheme, fetch would treat "my-api.up.railway.app" as a path on this site (the request then
// hits the static host and fails with a confusing 405), and a trailing "/" would double up.
function apiUrl(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return "http://localhost:5000";
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, "");
}

export const API_URL: string = apiUrl(import.meta.env.VITE_API_URL);

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status
    }
}

const TOKEN_KEY = "token";
const USER_KEY = "user";

export interface StoredUser {
  id: string;
  email: string;
}

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

// Login and signup both return { token, user }. Keep the user so the dashboard
// can show who's signed in without another request.
export function setSession(token: string, user: StoredUser): void {
  setToken(token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

// Logging out = forgetting the token and the user.
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// A token existing isn't enough: it may have expired (the backend issues 7-day tokens).
// A JWT's middle part is base64url JSON holding "exp" (seconds since 1970), so we can
// read it here. This only decides what the UI shows; the backend still verifies the
// signature on every request, so a faked token gets nobody anywhere.
export function isLoggedIn(): boolean {
  const token = getToken();
  if (!token) return false;

  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload)) as { exp?: number };
    if (typeof exp === "number" && exp * 1000 <= Date.now()) {
      clearToken(); // expired: forget it so the site stops treating you as logged in
      return false;
    }
    return true;
  } catch {
    clearToken(); // not a readable JWT at all
    return false;
  }
}


export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getToken();

    const response = await fetch(`${API_URL}${path}`, {

        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? {Authorization: `Bearer ${token}`} : {}),
            ...options.headers,
        }
    });

    // We sent a token and the server rejected it (expired, or the secret changed):
    // the session is over, so clear it and go to the login page.
    if (response.status === 401 && token) {
        clearToken();
        if (window.location.pathname !== "/login") window.location.assign("/login");
    }

    if(!response.ok) {
        const body = await response.json().catch(() => null);
        const message =  body?.error?.message ??`Request failed with status ${response.status}`;
        throw new ApiError(message, response.status);
    }

    if (response.status === 204) {
    return undefined as T;
  }
    return response.json();
}
