"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { StandixLogo } from "@standix/ui";
import { useAuth } from "@/components/auth-provider";

function getReturnPath() {
  const requestedPath = new URLSearchParams(window.location.search).get("next");
  if (
    requestedPath?.startsWith("/") &&
    !requestedPath.startsWith("//") &&
    !requestedPath.includes("\\") &&
    requestedPath !== "/login"
  ) {
    return requestedPath;
  }
  return "/dashboard";
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      router.replace(getReturnPath());
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Não foi possível iniciar sessão.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-2xl">
        <div className="mb-8 flex items-center justify-between">
          <StandixLogo />
          <Link href="/" className="text-sm text-muted hover:text-white">
            Início
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">Entrar na plataforma</h1>
        <p className="mt-2 text-sm text-muted">
          Use as credenciais da sua conta Standix.
        </p>
        <form
          className="mt-7 space-y-5"
          onSubmit={(event) => void submit(event)}
        >
          <label className="block text-sm">
            E-mail
            <input
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-white outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm">
            Senha
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-white outline-none focus:border-primary"
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
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
