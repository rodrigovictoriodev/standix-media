"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { getSocketUrl } from "@/lib/api";

type ScreenSlug = "main" | "stage" | "live" | "aux";

type ScreenState = {
  title: string;
  subtitle: string;
  status: string;
  content: string;
  updatedAt: string;
  sceneId?: string;
};

const baseState: Record<ScreenSlug, ScreenState> = {
  main: {
    title: "Tela principal",
    subtitle: "Pronto para projeção",
    status: "ready",
    content: "Conteúdo aguardando comando",
    updatedAt: new Date().toISOString(),
  },
  stage: {
    title: "Stage",
    subtitle: "Monitor de palco",
    status: "idle",
    content: "Aguardando cenário",
    updatedAt: new Date().toISOString(),
  },
  live: {
    title: "Live",
    subtitle: "Transmissão ativa",
    status: "live",
    content: "Feed em operação",
    updatedAt: new Date().toISOString(),
  },
  aux: {
    title: "Auxiliar",
    subtitle: "Comandos e atalhos",
    status: "ready",
    content: "Operação secundária ativa",
    updatedAt: new Date().toISOString(),
  },
};

export function ScreenLiveView({ screen }: { screen: ScreenSlug }) {
  const [state, setState] = useState<ScreenState>(baseState[screen]);
  const [connected, setConnected] = useState(false);
  const [transport, setTransport] = useState("demo");

  useEffect(() => {
    const accessToken = window.localStorage.getItem("standix-access-token");

    if (!accessToken) {
      setTransport("demo");
      setConnected(false);
      setState(baseState[screen]);
      return;
    }

    const socket: Socket = io(getSocketUrl(), {
      auth: { accessToken },
      reconnection: true,
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      setConnected(true);
      setTransport(socket.io.engine.transport.name);
      socket.emit("screen:join", { screen, groupId: "production" });
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setTransport("reconnecting");
    });

    socket.on("screen:state", ({ state: nextState }) => {
      if (nextState) setState(nextState);
    });

    socket.on("screen:state-change", ({ state: nextState }) => {
      if (nextState) setState(nextState);
    });

    return () => {
      socket.disconnect();
    };
  }, [screen]);

  const pulseColor =
    state.status === "live"
      ? "bg-emerald-500"
      : state.status === "warning"
        ? "bg-amber-500"
        : "bg-primary";

  return (
    <main className="flex min-h-screen flex-col bg-[#050b16] px-6 py-8 text-white md:px-12">
      <div className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface/80 p-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-secondary">
            Standix Media
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {screen.toUpperCase()}
          </h1>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-border bg-background px-3 py-2 text-sm text-muted">
          <span className={`h-2.5 w-2.5 rounded-full ${pulseColor}`} />
          {connected ? `Online · ${transport}` : "Demo mode"}
        </div>
      </div>

      <div className="grid flex-1 gap-6 xl:grid-cols-[1.5fr_0.5fr]">
        <div className="rounded-[28px] border border-border bg-surface p-6">
          <p className="text-xs uppercase tracking-[0.18em] text-secondary">
            Estado da tela
          </p>
          <h2 className="mt-3 text-4xl font-semibold">{state.title}</h2>
          <p className="mt-2 text-sm text-muted">{state.subtitle}</p>

          <div className="mt-8 rounded-2xl border border-border bg-background p-5">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs uppercase tracking-[0.24em] text-muted">
                Status
              </span>
              <span className="rounded-full border border-border bg-surface px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-secondary">
                {state.status}
              </span>
            </div>
            <p className="mt-6 text-2xl font-medium text-white">
              {state.content}
            </p>
            <div className="mt-5 text-xs text-muted">
              Última atualização:{" "}
              {new Date(state.updatedAt).toLocaleString("pt-BR")}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Sincronização
            </p>
            <div className="mt-4 space-y-3 text-sm text-white">
              <div className="flex items-center justify-between">
                <span>Conexão</span>
                <span className={connected ? "text-emerald-300" : "text-muted"}>
                  {connected ? "Ativa" : "Demo"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Canal</span>
                <span className="text-secondary">{screen}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Reconexão</span>
                <span className="text-muted">Auto</span>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Estado do feed
            </p>
            <div className="mt-4 rounded-xl border border-border bg-background p-4 text-sm text-muted">
              {state.sceneId
                ? `Cena ativa: ${state.sceneId}`
                : "Nenhuma cena ativa"}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
