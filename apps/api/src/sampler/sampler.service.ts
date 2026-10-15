import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

@Injectable()
export class SamplerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  listBanks(teamId: string) {
    return this.prisma.cueBank.findMany({
      where: { teamId },
      include: {
        cues: {
          where: { teamId },
          include: {
            asset: { select: { id: true, filename: true, metadata: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async createBank(
    teamId: string,
    input: { name: string; category?: string; color?: string },
  ) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException("Cue bank name is required");
    return this.prisma.cueBank.create({
      data: {
        teamId,
        name,
        category: input.category?.trim() || null,
        color: input.color ?? "#2563FF",
      },
      include: { cues: true },
    });
  }

  async updateBank(
    teamId: string,
    bankId: string,
    input: {
      name?: string;
      category?: string | null;
      color?: string | null;
      sortOrder?: number;
    },
  ) {
    await this.getBank(teamId, bankId);
    if (input.name !== undefined && !input.name.trim()) {
      throw new BadRequestException("Cue bank name is required");
    }
    return this.prisma.cueBank.update({
      where: { id: bankId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.category !== undefined
          ? { category: input.category?.trim() || null }
          : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
      },
      include: { cues: true },
    });
  }

  async deleteBank(teamId: string, bankId: string) {
    await this.getBank(teamId, bankId);
    await this.prisma.cueBank.delete({ where: { id: bankId } });
    return { id: bankId, deleted: true };
  }

  listCues(teamId: string, bankId?: string, category?: string) {
    return this.prisma.audioCue.findMany({
      where: {
        teamId,
        ...(bankId ? { bankId } : {}),
        ...(category ? { category } : {}),
      },
      include: {
        bank: true,
        asset: {
          select: { id: true, filename: true, kind: true, metadata: true },
        },
      },
      orderBy: [{ bank: { sortOrder: "asc" } }, { name: "asc" }],
    });
  }

  async createCue(
    teamId: string,
    input: {
      name: string;
      assetId: string;
      bankId?: string | null;
      eventId?: string | null;
      category?: string | null;
      hotkey?: string | null;
      loop?: boolean;
      volume?: number;
    },
  ) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException("Cue name is required");
    await this.validateAudioAsset(teamId, input.assetId);
    if (input.bankId) await this.getBank(teamId, input.bankId);
    if (input.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: input.eventId, teamId },
        select: { id: true },
      });
      if (!event)
        throw new BadRequestException("Event not found for this team");
    }
    this.validateVolume(input.volume);
    const hotkey = input.hotkey?.trim().toUpperCase() || null;
    if (hotkey) await this.assertHotkeyAvailable(teamId, hotkey);

    return this.prisma.audioCue.create({
      data: {
        teamId,
        name,
        assetId: input.assetId,
        bankId: input.bankId ?? null,
        eventId: input.eventId ?? null,
        category: input.category?.trim() || null,
        hotkey,
        loop: input.loop ?? false,
        volume: input.volume ?? 1,
      },
      include: {
        bank: true,
        asset: {
          select: { id: true, filename: true, kind: true, metadata: true },
        },
      },
    });
  }

  async updateCue(
    teamId: string,
    cueId: string,
    input: {
      name?: string;
      assetId?: string;
      bankId?: string | null;
      category?: string | null;
      hotkey?: string | null;
      loop?: boolean;
      volume?: number;
    },
  ) {
    await this.getCue(teamId, cueId);
    if (input.name !== undefined && !input.name.trim()) {
      throw new BadRequestException("Cue name is required");
    }
    if (input.assetId) await this.validateAudioAsset(teamId, input.assetId);
    if (input.bankId) await this.getBank(teamId, input.bankId);
    this.validateVolume(input.volume);
    const hotkey =
      input.hotkey === undefined
        ? undefined
        : input.hotkey?.trim().toUpperCase() || null;
    if (hotkey) await this.assertHotkeyAvailable(teamId, hotkey, cueId);

    return this.prisma.audioCue.update({
      where: { id: cueId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.assetId !== undefined ? { assetId: input.assetId } : {}),
        ...(input.bankId !== undefined ? { bankId: input.bankId } : {}),
        ...(input.category !== undefined
          ? { category: input.category?.trim() || null }
          : {}),
        ...(hotkey !== undefined ? { hotkey } : {}),
        ...(input.loop !== undefined ? { loop: input.loop } : {}),
        ...(input.volume !== undefined ? { volume: input.volume } : {}),
      },
      include: {
        bank: true,
        asset: {
          select: { id: true, filename: true, kind: true, metadata: true },
        },
      },
    });
  }

  async deleteCue(teamId: string, cueId: string) {
    await this.getCue(teamId, cueId);
    await this.prisma.audioCue.delete({ where: { id: cueId } });
    return { id: cueId, deleted: true };
  }

  async getCueForPlayback(teamId: string, cueId: string) {
    const cue = await this.prisma.audioCue.findFirst({
      where: { id: cueId, teamId },
      include: {
        asset: {
          include: { blob: true },
        },
      },
    });
    if (!cue) throw new NotFoundException("Audio cue not found");
    if (cue.asset.deletedAt) {
      throw new BadRequestException("Audio asset is in the trash");
    }

    return {
      id: cue.id,
      name: cue.name,
      loop: cue.loop,
      volume: cue.volume,
      url: await this.presign(
        cue.asset.blob.storageBucket,
        cue.asset.blob.storageKey,
      ),
    };
  }

  private async getBank(teamId: string, bankId: string) {
    const bank = await this.prisma.cueBank.findFirst({
      where: { id: bankId, teamId },
    });
    if (!bank) throw new NotFoundException("Cue bank not found");
    return bank;
  }

  private async getCue(teamId: string, cueId: string) {
    const cue = await this.prisma.audioCue.findFirst({
      where: { id: cueId, teamId },
      select: { id: true },
    });
    if (!cue) throw new NotFoundException("Audio cue not found");
    return cue;
  }

  private async validateAudioAsset(teamId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, teamId, kind: "AUDIO", deletedAt: null },
      select: { id: true },
    });
    if (!asset) {
      throw new BadRequestException(
        "Cue must reference an audio asset in this team",
      );
    }
  }

  private validateVolume(volume?: number) {
    if (
      volume !== undefined &&
      (!Number.isFinite(volume) || volume < 0 || volume > 1)
    ) {
      throw new BadRequestException("Cue volume must be between 0 and 1");
    }
  }

  private async assertHotkeyAvailable(
    teamId: string,
    hotkey: string,
    exceptCueId?: string,
  ) {
    const existing = await this.prisma.audioCue.findFirst({
      where: {
        teamId,
        hotkey,
        ...(exceptCueId ? { id: { not: exceptCueId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw new BadRequestException(
        "This hotkey is already assigned in this team",
      );
  }

  private async presign(bucket: string, key: string) {
    return this.storage.signedUrl(bucket, key);
  }
}
