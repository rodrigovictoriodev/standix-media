"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { writeTeamId } from "@/lib/api";
import { useApiSession } from "@/lib/use-api-session";

export function SessionControls() {
  const { user, teams, logout: endSession } = useAuth();
  const { accessToken, teamId, ready } = useApiSession();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await endSession();
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "Falha ao encerrar a sessão",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        {accessToken && user ? (
          <>
            <span className="text-xs text-emerald-300">
              {user.name} · {user.email}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              disabled={busy}
              className="rounded-lg border border-border px-3 py-2 text-xs text-white disabled:opacity-50"
            >
              Sair
            </button>
          </>
        ) : (
          <span className="text-xs text-muted">Sessão não autenticada</span>
        )}
        {teams.length > 1 ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            Equipe
            <select
              aria-label="Equipe atual"
              value={teamId}
              onChange={(event) => writeTeamId(event.target.value)}
              className="max-w-56 rounded-lg border border-border bg-background px-3 py-2 text-xs text-white"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        ) : teams[0] ? (
          <span className="text-xs text-muted">
            Equipe: <span className="text-white">{teams[0].name}</span>
          </span>
        ) : null}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-rose-200">
          {error}
        </p>
      )}
    </section>
  );
}
