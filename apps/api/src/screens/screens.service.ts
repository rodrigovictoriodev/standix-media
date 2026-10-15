import { Injectable } from "@nestjs/common";

export type ScreenKind = "main" | "stage" | "live" | "aux";

export type ScreenState = {
  title: string;
  subtitle: string;
  status: "idle" | "live" | "warning" | "ready";
  content: string;
  sceneId?: string;
  confidence?: number;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type ScreenGroup = {
  id: string;
  name: string;
  screens: ScreenKind[];
};

@Injectable()
export class ScreensService {
  private readonly groups = new Map<string, ScreenGroup>([
    ["production", { id: "production", name: "Produção geral", screens: ["main", "stage", "live", "aux"] }],
    ["stage", { id: "stage", name: "Stage control", screens: ["stage", "aux"] }],
  ]);

  private readonly initialStates = new Map<ScreenKind, ScreenState>([
    ["main", { title: "Tela principal", subtitle: "Pronto para projeção", status: "ready", content: "Conteúdo aguardando comando da operação", updatedAt: new Date().toISOString() }],
    ["stage", { title: "Stage", subtitle: "Monitor de palco", status: "idle", content: "Aguardando reprodução de cenário", updatedAt: new Date().toISOString() }],
    ["live", { title: "Live", subtitle: "Saída web e transmissão", status: "live", content: "Transmissão ativa", updatedAt: new Date().toISOString() }],
    ["aux", { title: "Auxiliar", subtitle: "Operação secundária", status: "ready", content: "Atalhos e comandos auxiliares disponíveis", updatedAt: new Date().toISOString() }],
  ]);

  // Screen output is isolated per team: one team can never read or drive
  // another team's screens.
  private readonly states = new Map<string, ScreenState>();

  private readonly sessions = new Map<string, { clientId: string; teamId: string; screen: ScreenKind; groupId: string; connectedAt: Date }>();

  listGroups() {
    return [...this.groups.values()];
  }

  getState(teamId: string, screen: ScreenKind) {
    return (
      this.states.get(`${teamId}:${screen}`) ??
      this.initialStates.get(screen) ??
      this.defaultState(screen)
    );
  }

  setState(teamId: string, screen: ScreenKind, state: Partial<ScreenState>) {
    const current = this.getState(teamId, screen);
    const next: ScreenState = {
      ...current,
      ...state,
      updatedAt: new Date().toISOString(),
    };
    this.states.set(`${teamId}:${screen}`, next);
    return next;
  }

  joinSession(clientId: string, teamId: string, screen: ScreenKind, groupId = "production") {
    this.sessions.set(clientId, { clientId, teamId, screen, groupId, connectedAt: new Date() });
    return this.getState(teamId, screen);
  }

  leaveSession(clientId: string) {
    const session = this.sessions.get(clientId);
    this.sessions.delete(clientId);
    return session;
  }

  getScreenByClient(clientId: string) {
    return this.sessions.get(clientId);
  }

  defaultState(screen: ScreenKind): ScreenState {
    return {
      title: `Tela ${screen}`,
      subtitle: "Esperando sincronização",
      status: "idle",
      content: "Sem estado recebido",
      updatedAt: new Date().toISOString(),
    };
  }
}
