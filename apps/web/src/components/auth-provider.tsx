"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  apiRequest,
  ApiRequestError,
  clearApiSession,
  readApiSession,
  writeApiSession,
  writeTeamId,
} from "@/lib/api";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

type InitializationStatus = {
  needsSetup: boolean;
  teams: { id: string; name: string }[];
};

type AuthContextValue = {
  user: AuthUser | null;
  teams: InitializationStatus["teams"];
  ready: boolean;
  initializationReady: boolean;
  initializationError: string;
  setupRequired: boolean;
  refreshInitialization: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const protectedRoutes = [
  "/dashboard",
  "/setup",
  "/library",
  "/events",
  "/presentations",
  "/sampler",
];

function requiresAuthentication(pathname: string) {
  return protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [teams, setTeams] = useState<InitializationStatus["teams"]>([]);
  const [ready, setReady] = useState(false);
  const [initializationReady, setInitializationReady] = useState(false);
  const [initializationError, setInitializationError] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const restoreSession = useCallback(async () => {
    const session = readApiSession();
    if (!session.accessToken && !session.refreshToken) {
      setUser(null);
      setReady(true);
      return;
    }

    try {
      setUser(await apiRequest<AuthUser>("/auth/me"));
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        clearApiSession();
      }
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  const refreshInitialization = useCallback(async () => {
    if (!user) return false;
    setInitializationReady(false);
    setInitializationError("");
    try {
      const status =
        await apiRequest<InitializationStatus>("/setup/status");
      const session = readApiSession();
      const selectedTeamIsAvailable = status.teams.some(
        (team) => team.id === session.teamId,
      );
      setTeams(status.teams);
      if (status.teams.length > 0 && !selectedTeamIsAvailable) {
        writeTeamId(status.teams[0].id);
      } else if (status.teams.length === 0 && session.teamId) {
        writeTeamId("");
      }
      setSetupRequired(status.needsSetup);
      setInitializationReady(true);
      return true;
    } catch (error) {
      setInitializationError(
        error instanceof Error
          ? error.message
          : "Não foi possível verificar a inicialização da plataforma.",
      );
      setInitializationReady(true);
      return false;
    }
  }, [user]);

  useEffect(() => {
    if (!ready || !user) {
      setInitializationReady(false);
      setInitializationError("");
      setSetupRequired(false);
      setTeams([]);
      return;
    }
    void refreshInitialization();
  }, [ready, refreshInitialization, user]);

  useEffect(() => {
    void restoreSession();

    const syncSession = () => {
      const session = readApiSession();
      if (!session.accessToken && !session.refreshToken) {
        setUser(null);
        setReady(true);
      } else {
        void restoreSession();
      }
    };
    window.addEventListener("storage", syncSession);
    window.addEventListener("standix:session-change", syncSession);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("standix:session-change", syncSession);
    };
  }, [restoreSession]);

  useEffect(() => {
    if (!ready) return;
    if (requiresAuthentication(pathname) && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (
      user &&
      initializationReady &&
      requiresAuthentication(pathname)
    ) {
      if (setupRequired && pathname !== "/setup") {
        router.replace("/setup");
      } else if (!setupRequired && pathname === "/setup") {
        router.replace("/dashboard");
      }
    }
  }, [
    initializationReady,
    pathname,
    ready,
    router,
    setupRequired,
    user,
  ]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    writeApiSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      teamId: readApiSession().teamId,
    });
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    const { refreshToken } = readApiSession();
    try {
      if (refreshToken) {
        await apiRequest("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        });
      }
    } finally {
      clearApiSession();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      teams,
      ready,
      initializationReady,
      initializationError,
      setupRequired,
      refreshInitialization,
      login,
      logout,
    }),
    [
      user,
      teams,
      ready,
      initializationReady,
      initializationError,
      setupRequired,
      refreshInitialization,
      login,
      logout,
    ],
  );
  const protectedPage = requiresAuthentication(pathname);
  const blocked =
    protectedPage && (!ready || !user || !initializationReady);

  return (
    <AuthContext.Provider value={value}>
      {blocked ? null : initializationError && protectedPage ? (
        <main className="flex min-h-screen items-center justify-center px-6">
          <section className="max-w-lg rounded-2xl border border-border bg-surface p-6">
            <p role="alert" className="text-sm text-rose-200">
              Não foi possível carregar o estado da plataforma:{" "}
              {initializationError}
            </p>
            <button
              type="button"
              onClick={() => void refreshInitialization()}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              Tentar novamente
            </button>
          </section>
        </main>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
