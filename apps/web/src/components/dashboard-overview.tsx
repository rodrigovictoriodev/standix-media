"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useApiSession } from "@/lib/use-api-session";

type DashboardSummary = {
  team: { id: string; name: string };
  userCount: number;
  assetCount: number;
  eventCount: number;
  presentationCount: number;
};

export function DashboardOverview() {
  const { accessToken, teamId, ready } = useApiSession();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    if (!ready) return;
    if (!accessToken || !teamId) {
      setSummary(null);
      setError("Nenhuma equipe está associada à sua conta.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      setSummary(await apiRequest<DashboardSummary>("/dashboard/summary"));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os dados do dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, ready, teamId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const stats = summary
    ? [
        { label: "Equipe atual", value: summary.team.name },
        { label: "Usuários", value: summary.userCount },
        { label: "Assets", value: summary.assetCount },
        { label: "Eventos", value: summary.eventCount },
        { label: "Apresentações", value: summary.presentationCount },
      ]
    : [];

  if (loading) {
    return (
      <p role="status" className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        Carregando dados da equipe...
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p role="alert" className="text-sm text-rose-200">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void loadSummary()}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label="Resumo da equipe atual"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
    >
      {stats.map(({ label, value }) => (
        <article
          key={label}
          className="min-w-0 rounded-2xl border border-border bg-surface p-5"
        >
          <h2 className="text-sm text-muted">{label}</h2>
          <p className="mt-5 break-words text-3xl font-semibold text-white">
            {typeof value === "number"
              ? value.toLocaleString("pt-BR")
              : value}
          </p>
        </article>
      ))}
    </section>
  );
}
