"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { apiRequest } from "@/lib/api";
import { useApiSession } from "@/lib/use-api-session";

type EventRecord = {
  id: string;
  name: string;
  description?: string | null;
  status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "FINISHED" | "ARCHIVED";
  startsAt?: string | null;
  endsAt?: string | null;
  categoryRef?: { id: string; name: string; color?: string | null } | null;
  members?: { id: string }[];
};

type EventCategory = {
  id: string;
  name: string;
};

type CalendarResponse = {
  events: EventRecord[];
};

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const statusLabels: Record<EventRecord["status"], string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendado",
  ACTIVE: "Ativo",
  FINISHED: "Finalizado",
  ARCHIVED: "Arquivado",
};

export function EventsDashboardView() {
  const { accessToken, teamId } = useApiSession();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [monthEvents, setMonthEvents] = useState<EventRecord[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadEvents = useCallback(async () => {
    if (!accessToken || !teamId) {
      setEvents([]);
      setMonthEvents([]);
      setCategories([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const monthParam = encodeURIComponent(month.toISOString());
      const [eventList, categoryList, calendar] = await Promise.all([
        apiRequest<EventRecord[]>("/events"),
        apiRequest<EventCategory[]>("/events/categories"),
        apiRequest<CalendarResponse>(`/events/calendar?month=${monthParam}`),
      ]);
      setEvents(eventList);
      setCategories(categoryList);
      setMonthEvents(calendar.events);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os eventos.",
      );
    } finally {
      setLoading(false);
    }
  }, [accessToken, month, teamId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const calendarDays = useMemo(() => {
    const offset = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const totalDays = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate();
    return { offset, totalDays };
  }, [month]);

  const scheduledCount = events.filter(
    (event) => event.status === "SCHEDULED",
  ).length;
  const activeCount = events.filter(
    (event) => event.status === "ACTIVE",
  ).length;
  const finishedCount = events.filter(
    (event) => event.status === "FINISHED",
  ).length;
  const memberCount = events.reduce(
    (total, event) => total + (event.members?.length ?? 0),
    0,
  );
  const monthEventDays = new Set(
    monthEvents
      .filter((event) => event.startsAt)
      .map((event) => new Date(event.startsAt!).getDate()),
  );

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiRequest<EventRecord>("/events", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          categoryId: categoryId || undefined,
          status: "SCHEDULED",
        }),
      });
      setName("");
      setStartsAt("");
      setCategoryId("");
      setShowCreateForm(false);
      await loadEvents();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Não foi possível criar o evento.",
      );
    } finally {
      setBusy(false);
    }
  }

  function changeMonth(delta: number) {
    setMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  }

  return (
    <div className="rounded-[28px] border border-border bg-surface/90 p-5 md:p-6">
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-secondary">
            Eventos
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Agenda e operação
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateForm((visible) => !visible)}
            disabled={!accessToken || !teamId}
            className="rounded-xl border border-border bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
          >
            + Novo evento
          </button>
          <button
            onClick={() => void loadEvents()}
            disabled={loading}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      {showCreateForm && accessToken && teamId && (
        <form
          onSubmit={(event) => void createEvent(event)}
          className="mb-6 grid gap-3 rounded-2xl border border-border bg-background p-4 md:grid-cols-4"
        >
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome do evento"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            aria-label="Data e horário de início"
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-white"
          />
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-white"
          >
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Criar evento
          </button>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      )}

      {!accessToken || !teamId ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Entre na plataforma e selecione uma equipe para carregar os eventos.
        </p>
      ) : (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            {[
              {
                label: "Agendados",
                value: scheduledCount,
                tone: "text-primary",
              },
              {
                label: "Ativos agora",
                value: activeCount,
                tone: "text-secondary",
              },
              {
                label: "Finalizados",
                value: finishedCount,
                tone: "text-white",
              },
              {
                label: "Membros em eventos",
                value: memberCount,
                tone: "text-emerald-300",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-border bg-background p-4"
              >
                <p className="text-sm text-muted">{card.label}</p>
                <p className={`mt-4 text-3xl font-semibold ${card.tone}`}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Calendário</h3>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="Mês anterior"
                    onClick={() => changeMonth(-1)}
                    className="rounded-lg border border-border px-2 py-1 text-sm text-white"
                  >
                    ‹
                  </button>
                  <span className="min-w-32 text-center text-sm capitalize text-muted">
                    {month.toLocaleDateString("pt-BR", {
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                  <button
                    aria-label="Próximo mês"
                    onClick={() => changeMonth(1)}
                    className="rounded-lg border border-border px-2 py-1 text-sm text-white"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.18em] text-muted">
                {weekdays.map((day) => (
                  <div key={day} className="py-2">
                    {day}
                  </div>
                ))}
                {Array.from({ length: calendarDays.offset }, (_, index) => (
                  <div
                    key={`spacer-${index}`}
                    className="h-10 rounded-xl border border-transparent"
                  />
                ))}
                {Array.from({ length: calendarDays.totalDays }, (_, index) => {
                  const day = index + 1;
                  const hasEvent = monthEventDays.has(day);
                  return (
                    <div
                      key={day}
                      className={`flex h-14 items-center justify-center rounded-xl border ${
                        hasEvent
                          ? "border-primary bg-primary/10 text-white"
                          : "border-border bg-surface text-muted"
                      }`}
                    >
                      <span className="text-sm">{day}</span>
                    </div>
                  );
                })}
              </div>
              {loading && (
                <p className="mt-3 text-xs text-muted">
                  Atualizando calendário…
                </p>
              )}
            </div>

            <div className="space-y-4">
              {monthEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-2xl border border-border bg-background p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-medium text-white">{event.name}</h4>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">
                        {event.categoryRef?.name ?? "Sem categoria"}
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-secondary">
                      {statusLabels[event.status]}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-muted">
                    <div>
                      {event.startsAt
                        ? new Date(event.startsAt).toLocaleString("pt-BR")
                        : "Data não definida"}
                    </div>
                    <div>{event.members?.length ?? 0} membros</div>
                  </div>
                </div>
              ))}
              {!loading && monthEvents.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
                  Nenhum evento neste mês.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
