import type { ReactNode } from "react";
import Link from "next/link";
import { SessionControls } from "./session-controls";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Biblioteca", href: "/library" },
  { label: "Eventos", href: "/events" },
  { label: "Apresentações", href: "/presentations" },
  { label: "Telas", href: "/screen/main" },
  { label: "Sampler", href: "/sampler" },
  { label: "Administração" },
];

type DashboardSection =
  | "Dashboard"
  | "Biblioteca"
  | "Eventos"
  | "Apresentações"
  | "Sampler";

export function DashboardShell({
  children,
  activeItem = "Dashboard",
}: {
  children?: ReactNode;
  activeItem?: DashboardSection;
}) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-72 border-r border-border bg-surface/80 p-6 md:block">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white">
            S
          </div>
          <div>
            <div className="text-lg font-semibold">Standix</div>
            <div className="text-xs uppercase tracking-[0.2em] text-muted">
              Media
            </div>
          </div>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.label === activeItem ? "page" : undefined}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  item.label === activeItem
                    ? "border-primary/40 bg-primary/10 text-white"
                    : "border-transparent bg-transparent text-muted hover:border-border hover:text-white"
                }`}
              >
                {item.label}
                {item.label === activeItem ? (
                  <span className="h-2 w-2 rounded-full bg-primary" />
                ) : null}
              </Link>
            ) : (
              <span
                key={item.label}
                aria-disabled="true"
                title="Área ainda não implementada"
                className="flex w-full cursor-not-allowed items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-left text-sm text-muted/60"
              >
                {item.label}
              </span>
            ),
          )}
        </nav>

        <div className="mt-10 rounded-2xl border border-border bg-background p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">
            Status
          </p>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted">Sistema</span>
            <span className="inline-flex items-center gap-2 text-sm text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              Estável
            </span>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-5 md:p-8">
        <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-secondary">
              Overview
            </p>
            <h1 className="mt-2 text-3xl font-semibold">{activeItem}</h1>
          </div>

          <div className="w-full md:max-w-3xl">
            <SessionControls />
          </div>
        </header>

        {children ? <div className="mt-8">{children}</div> : null}
      </main>
    </div>
  );
}
