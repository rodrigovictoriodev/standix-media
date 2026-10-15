"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useApiSession } from "@/lib/use-api-session";

type CueBank = {
  id: string;
  name: string;
  category?: string | null;
  color?: string | null;
  cues?: AudioCue[];
};

type AudioCue = {
  id: string;
  name: string;
  assetId: string;
  bankId?: string | null;
  category?: string | null;
  hotkey?: string | null;
  loop: boolean;
  volume: number;
  asset: { id: string; filename: string; metadata?: Record<string, unknown> };
};

type AudioAsset = {
  id: string;
  filename: string;
  kind: string;
  deletedAt?: string | null;
  metadata?: Record<string, unknown>;
};

function hotkeyForEvent(event: KeyboardEvent) {
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("CTRL");
  if (event.altKey) modifiers.push("ALT");
  if (event.shiftKey) modifiers.push("SHIFT");
  if (event.metaKey) modifiers.push("META");
  const key =
    event.key.length === 1 ? event.key.toUpperCase() : event.key.toUpperCase();
  return [...modifiers, key].join("+");
}

export function SamplerPanel() {
  const { accessToken: token, teamId } = useApiSession();
  const [banks, setBanks] = useState<CueBank[]>([]);
  const [cues, setCues] = useState<AudioCue[]>([]);
  const [assets, setAssets] = useState<AudioAsset[]>([]);
  const [activeBankId, setActiveBankId] = useState("");
  const [search, setSearch] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [newCueName, setNewCueName] = useState("");
  const [newAssetId, setNewAssetId] = useState("");
  const [newHotkey, setNewHotkey] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [loop, setLoop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [playingIds, setPlayingIds] = useState<string[]>([]);
  const playing = useRef(new Map<string, Set<HTMLAudioElement>>());

  const api = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      if (!token || !teamId)
        throw new Error("Entre na plataforma e selecione uma equipe para conectar.");
      return apiRequest<T>(path, init);
    },
    [teamId, token],
  );

  const loadPanel = useCallback(async () => {
    const [bankList, cueList, assetList] = await Promise.all([
      api<CueBank[]>("/sampler/banks"),
      api<AudioCue[]>("/sampler/cues"),
      api<AudioAsset[]>("/assets?kind=AUDIO"),
    ]);
    setBanks(bankList);
    setCues(cueList);
    setAssets(
      assetList.filter((asset) => asset.kind === "AUDIO" && !asset.deletedAt),
    );
    setActiveBankId((current) => current || bankList[0]?.id || "");
    setConnected(true);
    setError("");
  }, [api]);

  useEffect(() => {
    if (!token || !teamId) {
      setConnected(false);
      setBanks([]);
      setCues([]);
      setAssets([]);
      return;
    }
    void loadPanel().catch((loadError: unknown) => {
      setConnected(false);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível conectar",
      );
    });
  }, [loadPanel, teamId, token]);

  const stopCue = useCallback((cueId: string) => {
    const instances = playing.current.get(cueId);
    if (!instances) return;
    for (const audio of instances) {
      audio.pause();
      audio.currentTime = 0;
    }
    playing.current.delete(cueId);
    setPlayingIds([...playing.current.keys()]);
  }, []);

  const stopAll = useCallback(() => {
    for (const cueId of playing.current.keys()) {
      const instances = playing.current.get(cueId);
      instances?.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    }
    playing.current.clear();
    setPlayingIds([]);
  }, []);

  useEffect(() => {
    if (!token) stopAll();
  }, [stopAll, token]);

  const playCue = useCallback(
    async (cue: AudioCue) => {
      const playback = await api<{
        url: string;
        volume: number;
        loop: boolean;
      }>(`/sampler/cues/${cue.id}/play`, { method: "POST" });
      const audio = new Audio(playback.url);
      audio.volume = Math.min(1, Math.max(0, playback.volume));
      audio.loop = playback.loop;
      const instances =
        playing.current.get(cue.id) ?? new Set<HTMLAudioElement>();
      instances.add(audio);
      playing.current.set(cue.id, instances);
      setPlayingIds([...playing.current.keys()]);
      audio.addEventListener(
        "ended",
        () => {
          instances.delete(audio);
          if (instances.size === 0) {
            playing.current.delete(cue.id);
            setPlayingIds([...playing.current.keys()]);
          }
        },
        { once: true },
      );
      audio.addEventListener(
        "error",
        () => {
          instances.delete(audio);
          if (instances.size === 0) {
            playing.current.delete(cue.id);
            setPlayingIds([...playing.current.keys()]);
          }
          setError(`Falha ao reproduzir ${cue.name}`);
        },
        { once: true },
      );
      try {
        await audio.play();
      } catch (playError) {
        instances.delete(audio);
        if (instances.size === 0) {
          playing.current.delete(cue.id);
          setPlayingIds([...playing.current.keys()]);
        }
        throw playError;
      }
    },
    [api],
  );

  useEffect(() => {
    if (!connected || cues.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      const hotkey = hotkeyForEvent(event);
      const cue = cues.find((item) => item.hotkey?.toUpperCase() === hotkey);
      if (!cue) return;
      event.preventDefault();
      void playCue(cue).catch((playError: unknown) => {
        setError(
          playError instanceof Error
            ? playError.message
            : "Falha na reprodução",
        );
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [connected, cues, playCue]);

  useEffect(() => () => stopAll(), [stopAll]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "A operação falhou",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createBank() {
    if (!newBankName.trim()) throw new Error("Informe o nome do banco.");
    const bank = await api<CueBank>("/sampler/banks", {
      method: "POST",
      body: JSON.stringify({ name: newBankName.trim() }),
    });
    setBanks((items) => [...items, bank]);
    setActiveBankId(bank.id);
    setNewBankName("");
  }

  async function createCue() {
    if (!newCueName.trim() || !newAssetId)
      throw new Error("Informe o nome e selecione um arquivo de áudio.");
    const cue = await api<AudioCue>("/sampler/cues", {
      method: "POST",
      body: JSON.stringify({
        name: newCueName.trim(),
        assetId: newAssetId,
        bankId: activeBankId || null,
        hotkey: newHotkey || null,
        category: newCategory || null,
        loop,
      }),
    });
    setCues((items) => [...items, cue]);
    setNewCueName("");
    setNewAssetId("");
    setNewHotkey("");
    setNewCategory("");
    setLoop(false);
  }

  async function deleteCue(cueId: string) {
    await api(`/sampler/cues/${cueId}`, { method: "DELETE" });
    stopCue(cueId);
    setCues((items) => items.filter((cue) => cue.id !== cueId));
  }

  const categories = [
    ...new Set(
      cues
        .map((cue) => cue.category)
        .filter((category): category is string => !!category),
    ),
  ];
  const visibleCues = cues.filter((cue) => {
    const matchesBank = !activeBankId || cue.bankId === activeBankId;
    const matchesSearch =
      `${cue.name} ${cue.category ?? ""} ${cue.asset.filename}`
        .toLowerCase()
        .includes(search.toLowerCase());
    return matchesBank && matchesSearch;
  });

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-secondary">
            Sampler · audio
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Painel de sonoplastia</h2>
          <p className="mt-1 text-sm text-muted">
            Dispare cues instantaneamente, em paralelo, pelo painel ou por
            hotkey.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void run(loadPanel)}
            disabled={busy || !token || !teamId}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {connected ? "Atualizar" : "Conectar"}
          </button>
          <button
            onClick={stopAll}
            className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200"
          >
            ■ Parar tudo
          </button>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-3xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Cue banks</h3>
            <span
              className={`rounded-full px-2 py-1 text-[10px] ${connected ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}
            >
              {connected ? "Conectado" : "Offline"}
            </span>
          </div>
          <button
            onClick={() => setActiveBankId("")}
            className={`w-full rounded-xl border p-3 text-left text-sm ${activeBankId === "" ? "border-primary/50 bg-primary/10 text-white" : "border-border bg-background text-muted"}`}
          >
            Todos os cues
          </button>
          {banks.map((bank) => (
            <button
              key={bank.id}
              onClick={() => setActiveBankId(bank.id)}
              className={`w-full rounded-xl border p-3 text-left text-sm ${activeBankId === bank.id ? "border-primary/50 bg-primary/10 text-white" : "border-border bg-background text-muted"}`}
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: bank.color ?? "#2563FF" }}
                />
                {bank.name}
              </span>
              {bank.category && (
                <span className="mt-1 block text-xs text-muted">
                  {bank.category}
                </span>
              )}
            </button>
          ))}
          <form
            className="flex gap-2 border-t border-border pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void run(createBank);
            }}
          >
            <input
              value={newBankName}
              onChange={(event) => setNewBankName(event.target.value)}
              placeholder="Novo banco"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-2 text-xs"
            />
            <button
              aria-label="Adicionar banco"
              disabled={busy || !token || !teamId}
              className="rounded-lg bg-primary px-3 text-white disabled:opacity-50"
            >
              +
            </button>
          </form>
        </aside>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
            <div>
              <h3 className="font-semibold">
                {activeBankId
                  ? banks.find((bank) => bank.id === activeBankId)?.name
                  : "Todos os bancos"}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {playingIds.length} cues em reprodução · sons simultâneos
                habilitados
              </p>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cue ou categoria"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSearch(search === category ? "" : category)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted hover:text-white"
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visibleCues.map((cue) => {
              const isPlaying = playingIds.includes(cue.id);
              return (
                <div
                  key={cue.id}
                  className={`rounded-2xl border p-4 transition ${isPlaying ? "border-secondary bg-secondary/10" : "border-border bg-surface"}`}
                >
                  <button
                    onClick={() =>
                      void run(() =>
                        isPlaying
                          ? Promise.resolve(stopCue(cue.id))
                          : playCue(cue),
                      )
                    }
                    className="flex min-h-32 w-full flex-col items-center justify-center rounded-xl border border-border bg-background p-3 text-center hover:border-primary"
                  >
                    <span className="text-3xl">{isPlaying ? "♫" : "▶"}</span>
                    <span className="mt-3 line-clamp-2 text-sm font-semibold text-white">
                      {cue.name}
                    </span>
                    <span className="mt-1 line-clamp-1 text-[10px] text-muted">
                      {cue.asset.filename}
                    </span>
                  </button>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="truncate">
                      {cue.category || "Sem categoria"}
                      {cue.loop ? " · Loop" : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      {cue.hotkey && (
                        <kbd className="rounded border border-border bg-background px-2 py-1 text-white">
                          {cue.hotkey}
                        </kbd>
                      )}
                      <button
                        aria-label={`Excluir ${cue.name}`}
                        onClick={() => void run(() => deleteCue(cue.id))}
                        className="text-rose-300"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {visibleCues.length === 0 && (
              <p className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
                Nenhum cue neste banco. Crie um cue usando a biblioteca de áudio
                abaixo.
              </p>
            )}
          </div>

          <form
            className="grid gap-3 rounded-2xl border border-border bg-surface p-4 md:grid-cols-2 xl:grid-cols-6"
            onSubmit={(event) => {
              event.preventDefault();
              void run(createCue);
            }}
          >
            <input
              value={newCueName}
              onChange={(event) => setNewCueName(event.target.value)}
              placeholder="Nome do cue"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <select
              value={newAssetId}
              onChange={(event) => setNewAssetId(event.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-white"
            >
              <option value="">Arquivo de áudio</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.filename}
                </option>
              ))}
            </select>
            <input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="Categoria"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={newHotkey}
              onChange={(event) =>
                setNewHotkey(event.target.value.toUpperCase())
              }
              placeholder="Hotkey (ex: A)"
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={loop}
                onChange={(event) => setLoop(event.target.checked)}
              />
              Repetir em loop
            </label>
            <button
              disabled={busy || !token || !teamId}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              + Adicionar cue
            </button>
          </form>
        </section>
      </div>
      <p className="text-xs text-muted">
        Integrações futuras preparadas por adaptadores: MIDI · Elgato Stream
        Deck · Bitfocus Companion.
      </p>
    </div>
  );
}
