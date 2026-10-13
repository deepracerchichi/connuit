const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000"

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status
    }
}

export function getToken(): string | null {
    return localStorage.getItem("token");
}

export function setToken(token: string): void {
  localStorage.setItem("token", token);
}

export function clearToken(): void {
  localStorage.removeItem("token");
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

    const response = await fetch(`${BASE_URL}${path}`, {

        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(token ? {Authorization: `Bearer ${token}`} : {}),
            ...options.headers,
        }
    });

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


