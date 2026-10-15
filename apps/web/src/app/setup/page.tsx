"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { StandixLogo } from "@standix/ui";
import { useAuth } from "@/components/auth-provider";
import { apiRequest } from "@/lib/api";

type SetupResponse = {
  workspace: { id: string; name: string };
  team: { id: string; name: string };
};

export default function SetupPage() {
  const { refreshInitialization } = useAuth();
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("Standix");
  const [teamName, setTeamName] = useState("Administradores");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest<SetupResponse>("/setup", {
        method: "POST",
        body: JSON.stringify({
          organizationName: organizationName.trim(),
          teamName: teamName.trim(),
        }),
      });
      if (!(await refreshInitialization())) {
        throw new Error(
          "A configuração foi salva, mas não foi possível atualizar a sessão.",
        );
      }
      router.replace("/dashboard");
    } catch (setupError) {
      setError(
        setupError instanceof Error
          ? setupError.message
          : "Não foi possível concluir a configuração.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-xl rounded-3xl border border-border bg-surface p-8 shadow-2xl md:p-10">
        <div className="mb-8">
          <StandixLogo />
        </div>
        <p className="text-xs uppercase tracking-[0.22em] text-secondary">
          Primeira configuração
        </p>
        <h1 className="mt-3 text-2xl font-semibold">
          Vamos preparar seu espaço
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Informe o nome da organização e da equipe principal para concluir a
          inicialização do Standix Media.
        </p>

        <form
          className="mt-8 space-y-5"
          onSubmit={(event) => void submit(event)}
        >
          <label className="block text-sm">
            Nome da organização
            <input
              autoFocus
              required
              maxLength={120}
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-white outline-none focus:border-primary"
              placeholder="Standix"
            />
          </label>
          <label className="block text-sm">
            Nome da equipe principal
            <input
              required
              maxLength={120}
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-white outline-none focus:border-primary"
              placeholder="Administradores"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-rose-200">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Inicializando..." : "Concluir configuração"}
          </button>
        </form>
      </section>
    </main>
  );
}
