import type { ApiError, AuthTokens } from "@standix/types";

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | undefined;
}

export class StandixApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.options.getAccessToken?.();
    const response = await fetch(new URL(path.replace(/^\/+/, ""), this.options.baseUrl), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      const error = (await response.json()) as ApiError;
      throw new Error(
        Array.isArray(error.message) ? error.message.join(", ") : error.message,
      );
    }

    return (await response.json()) as T;
  }

  login(email: string, password: string) {
    return this.request<AuthTokens>("auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }
}
