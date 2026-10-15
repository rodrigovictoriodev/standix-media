import { Logger, UsePipes, ValidationPipe } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service";
import { ScreensService, type ScreenKind } from "../screens/screens.service";

type ClientSocket = Socket & { data: { userId?: string } };

@WebSocketGateway({
  namespace: "/events",
  cors: {
    origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000").split(","),
    credentials: true,
  },
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class RealtimeGateway {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly screens: ScreensService,
  ) {}

  async handleConnection(client: ClientSocket) {
    const token =
      client.handshake.auth?.accessToken ??
      client.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (typeof token !== "string") {
      client.disconnect(true);
      return;
    }

    let payload: { sub: string; type: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; type: string }>(
        token,
        { secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET") },
      );
      if (payload.type !== "access") throw new Error("Invalid token type");
    } catch (error) {
      this.logger.warn(`Rejected unauthenticated socket ${client.id}`);
      client.disconnect(true);
      return;
    }
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, status: "ACTIVE" },
      select: { id: true },
    });
    if (!user) {
      this.logger.warn(`Rejected inactive socket account ${client.id}`);
      client.disconnect(true);
      return;
    }
    client.data.userId = user.id;
  }

  handleDisconnect(client: ClientSocket) {
    this.screens.leaveSession(client.id);
  }

  @SubscribeMessage("screen:join")
  async joinScreen(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() body: { screen?: string; groupId?: string; teamId?: string },
  ) {
    const screen = this.parseScreen(body?.screen);
    const teamId = await this.authorizeTeam(client, body?.teamId, "screens:read");

    const groupId = body.groupId ?? "production";
    this.screens.joinSession(client.id, teamId, screen, groupId);
    await client.join(this.screenRoom(teamId, screen));

    const state = this.screens.getState(teamId, screen);
    client.emit("screen:state", { screen, groupId, state });
    return { screen, groupId, state };
  }

  @SubscribeMessage("screen:update-state")
  async updateScreenState(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody()
    body: { screen?: string; teamId?: string; state?: Record<string, unknown> },
  ) {
    const screen = this.parseScreen(body?.screen);
    const teamId = await this.authorizeTeam(client, body?.teamId, "screens:operate");

    const state = this.screens.setState(teamId, screen, {
      title: typeof body.state?.title === "string" ? body.state.title : undefined,
      subtitle: typeof body.state?.subtitle === "string" ? body.state.subtitle : undefined,
      status: typeof body.state?.status === "string" ? (body.state.status as any) : undefined,
      content: typeof body.state?.content === "string" ? body.state.content : undefined,
      sceneId: typeof body.state?.sceneId === "string" ? body.state.sceneId : undefined,
      confidence: typeof body.state?.confidence === "number" ? body.state.confidence : undefined,
      metadata: typeof body.state?.metadata === "object" ? (body.state.metadata as Record<string, unknown>) : undefined,
    });

    this.server.to(this.screenRoom(teamId, screen)).emit("screen:state-change", {
      screen,
      state,
    });
    return { screen, state };
  }

  @SubscribeMessage("screen:request-state")
  async getScreenState(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() body: { screen?: string; teamId?: string },
  ) {
    const screen = this.parseScreen(body?.screen);
    const teamId = await this.authorizeTeam(client, body?.teamId, "screens:read");

    const state = this.screens.getState(teamId, screen);
    client.emit("screen:state", { screen, state });
    return { screen, state };
  }

  private parseScreen(value: unknown): ScreenKind {
    if (typeof value !== "string" || !["main", "stage", "live", "aux"].includes(value)) {
      throw new WsException("Invalid screen identifier");
    }
    return value as ScreenKind;
  }

  private async authorizeTeam(client: ClientSocket, teamId: unknown, permission: string) {
    const userId = client.data.userId;
    if (!userId || typeof teamId !== "string" || !teamId) {
      throw new WsException("A team is required for screen operations");
    }
    if (!(await this.hasPermission(userId, permission, teamId))) {
      throw new WsException("Not authorized for this team's screens");
    }
    return teamId;
  }

  private screenRoom(teamId: string, screen: ScreenKind) {
    return `team:${teamId}:screen:${screen}`;
  }

  async broadcastPresentation(presentationId: string) {
    if (!this.server) return;

    const presentation = await this.prisma.presentation.findUnique({
      where: { id: presentationId },
      include: {
        activeSlide: true,
        slides: {
          orderBy: { orderIndex: "asc" },
          include: {
            asset: {
              select: { id: true, filename: true, kind: true, metadata: true },
            },
          },
        },
      },
    });
    if (!presentation) return;

    this.server
      .to(`presentation:${presentationId}`)
      .emit("presentation:update", presentation);
  }

  @SubscribeMessage("presentation:join")
  async joinPresentation(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() body: { presentationId?: string },
  ) {
    const userId = client.data.userId;
    const presentationId = body?.presentationId;
    if (!userId || !presentationId) {
      throw new WsException("Invalid presentation request");
    }

    const presentation = await this.prisma.presentation.findUnique({
      where: { id: presentationId },
      select: { id: true, teamId: true },
    });
    if (!presentation) throw new WsException("Presentation not found");
    if (!(await this.hasPermission(userId, "presentations:read", presentation.teamId))) {
      throw new WsException("Not authorized to view this presentation");
    }

    await client.join(`presentation:${presentation.id}`);
    await this.broadcastPresentation(presentation.id);
    return { presentationId, joined: true };
  }

  @SubscribeMessage("presentation:show-slide")
  async showPresentationSlide(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() body: { presentationId?: string; slideId?: string },
  ) {
    const userId = client.data.userId;
    const { presentationId, slideId } = body ?? {};
    if (!userId || !presentationId || !slideId) {
      throw new WsException("Invalid slide operation");
    }

    const presentation = await this.prisma.presentation.findUnique({
      where: { id: presentationId },
      select: { id: true, teamId: true },
    });
    if (!presentation) throw new WsException("Presentation not found");
    if (!(await this.hasPermission(userId, "presentations:operate", presentation.teamId))) {
      throw new WsException("Not authorized to operate this presentation");
    }

    const slide = await this.prisma.slide.findFirst({
      where: { id: slideId, presentationId },
      select: { id: true },
    });
    if (!slide) throw new WsException("Slide not found in this presentation");

    await this.prisma.presentation.update({
      where: { id: presentationId },
      data: { activeSlideId: slide.id },
    });
    await this.broadcastPresentation(presentationId);
    return { presentationId, slideId, active: true };
  }

  @SubscribeMessage("event:join")
  async joinEvent(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() body: { eventId?: string },
  ) {
    const userId = client.data.userId;
    if (!userId || !body?.eventId) throw new WsException("Invalid event request");

    const event = await this.prisma.event.findUnique({
      where: { id: body.eventId },
      select: { id: true, teamId: true },
    });
    if (!event) throw new WsException("Event not found");

    const assignment = await this.prisma.userRole.findFirst({
      where: {
        userId,
        OR: [
          { teamId: event.teamId },
          { teamId: null, role: { name: "Admin" } },
        ],
      },
      select: { id: true },
    });
    if (!assignment) throw new WsException("Not authorized for this event");

    await client.join(`event:${event.id}`);
    return { eventId: event.id, joined: true };
  }

  private async hasPermission(userId: string, permission: string, teamId: string) {
    const assignment = await this.prisma.userRole.findFirst({
      where: {
        userId,
        OR: [{ teamId }, { teamId: null }],
        role: {
          permissions: {
            some: { permission: { key: permission } },
          },
        },
      },
      select: { id: true },
    });
    return Boolean(assignment);
  }
}
