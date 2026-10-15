import Link from "next/link";
import { StandixLogo } from "@standix/ui";

const workspaces = [
  {
    title: "Biblioteca de mídia",
    description: "Centralize imagens, vídeos e áudios do seu time.",
    marker: "01",
  },
  {
    title: "Apresentações",
    description: "Crie apresentações nativas com slides e layouts.",
    marker: "02",
  },
  {
    title: "Eventos",
    description: "Organize sessões, produções e transmissões.",
    marker: "03",
  },
  {
    title: "Operação ao vivo",
    description: "Prepare telas e controles para sua equipe.",
    marker: "04",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-8 md:px-12 md:py-10">
      <header className="mx-auto flex max-w-7xl items-center justify-between">
        <StandixLogo />
        <span className="rounded-full border border-border bg-surface px-4 py-2 text-xs text-muted">
          EVENT MEDIA PLATFORM
        </span>
      </header>

      <section className="mx-auto grid max-w-7xl gap-14 pb-20 pt-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:pt-28">
        <div>
          <p className="mb-5 text-sm font-medium uppercase tracking-[0.22em] text-secondary">
            Operação de mídia, em um só lugar
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Sua equipe no controle de cada{" "}
            <span className="text-primary">momento ao vivo.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-muted md:text-lg">
            Apresentações, conteúdo e telas conectados para eventos de qualquer
            formato — de conferências e espetáculos a cultos e transmissões.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold transition hover:bg-blue-500"
            >
              Abrir plataforma
            </Link>
            <a
              href="#platform"
              className="rounded-xl border border-border bg-surface px-6 py-3 text-sm font-medium text-muted transition hover:text-white"
            >
              Conhecer recursos
            </a>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-7 md:p-9">
          <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between border-b border-border pb-5">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted">Painel de operação</p>
                <p className="mt-2 text-lg font-medium">Conferência anual</p>
              </div>
              <span className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Preparado
              </span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {["Apresentações", "Biblioteca", "Telas", "Equipe"].map((item, index) => (
                <div key={item} className="rounded-2xl border border-border bg-background/70 p-4">
                  <span className="text-xs text-muted">0{index + 1}</span>
                  <p className="mt-5 text-sm font-medium">{item}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-background/70 p-4">
              <div>
                <p className="text-xs text-muted">Evento ativo</p>
                <p className="mt-1 text-sm font-medium">Sessão principal</p>
              </div>
              <span className="h-2 w-2 rounded-full bg-secondary shadow-[0_0_14px_#11c8e8]" />
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="mx-auto max-w-7xl border-t border-border pt-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-sm text-muted">Uma plataforma modular</p>
            <h2 className="mt-2 text-2xl font-semibold">Tudo pronto para sua produção</h2>
          </div>
          <span className="hidden text-xs text-muted md:block">CORE · ASSETS · LIVE</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {workspaces.map((item) => (
            <article key={item.marker} className="rounded-2xl border border-border bg-surface p-5">
              <span className="text-xs text-secondary">{item.marker}</span>
              <h3 className="mt-7 font-medium">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
            </article>
          ))}
        </div>
      </section>
      <footer className="mx-auto mt-12 flex max-w-7xl justify-between border-t border-border pt-5 text-xs text-muted">
        <span>Standix Media</span>
        <span>Produções melhores começam com uma boa operação.</span>
      </footer>
    </main>
  );
}
