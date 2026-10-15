const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || "/api";

export type ApiSession = {
  accessToken: string;
  refreshToken: string;
  teamId: string;
};

let refreshInFlight: Promise<string | null> | null = null;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function apiUrl(path: string) {
  return `${API_BASE_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function getSocketUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  const url = new URL(configuredUrl || "/", window.location.origin);
  const pathname = url.pathname.replace(/\/+$/, "");
  if (!pathname.endsWith("/events")) {
    url.pathname = `${pathname}/events`;
  }
  return url.toString().replace(/\/$/, "");
}

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const session = readApiSession();
    if (!session.refreshToken) return null;

    const response = await fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!response.ok) {
      clearApiSession();
      return null;
    }

    const tokens = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    writeApiSession({ ...session, ...tokens });
    return tokens.accessToken;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const accessToken =
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem("standix-access-token") ?? "");
  const teamId =
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem("standix-team-id") ??
        process.env.NEXT_PUBLIC_DEFAULT_TEAM_ID ??
        "");

  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (teamId && !headers.has("x-team-id")) {
    headers.set("x-team-id", teamId);
  }
  if (
    init.body &&
    !(typeof FormData !== "undefined" && init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let response = await fetch(apiUrl(path), { ...init, headers });
  const authEndpoint =
    /^\/?auth\/(?:login|refresh|logout|forgot-password|reset-password)(?:\/|$)/.test(
      path,
    );
  if (response.status === 401 && !authEndpoint) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      headers.set("Authorization", `Bearer ${refreshedToken}`);
      response = await fetch(apiUrl(path), { ...init, headers });
    }
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new ApiRequestError(
      message ?? `API retornou ${response.status}`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function readApiSession(): ApiSession {
  if (typeof window === "undefined") {
    return { accessToken: "", refreshToken: "", teamId: "" };
  }
  return {
    accessToken: window.localStorage.getItem("standix-access-token") ?? "",
    refreshToken: window.localStorage.getItem("standix-refresh-token") ?? "",
    teamId:
      window.localStorage.getItem("standix-team-id") ??
      process.env.NEXT_PUBLIC_DEFAULT_TEAM_ID ??
      "",
  };
}

export function writeApiSession(session: ApiSession) {
  window.localStorage.setItem("standix-access-token", session.accessToken);
  window.localStorage.setItem("standix-refresh-token", session.refreshToken);
  if (session.teamId) {
    window.localStorage.setItem("standix-team-id", session.teamId);
  } else {
    window.localStorage.removeItem("standix-team-id");
  }
  window.dispatchEvent(new Event("standix:session-change"));
}

export function writeTeamId(teamId: string) {
  if (teamId) {
    window.localStorage.setItem("standix-team-id", teamId);
  } else {
    window.localStorage.removeItem("standix-team-id");
  }
  window.dispatchEvent(new Event("standix:session-change"));
}

export function clearApiSession() {
  window.localStorage.removeItem("standix-access-token");
  window.localStorage.removeItem("standix-refresh-token");
  window.dispatchEvent(new Event("standix:session-change"));
}
