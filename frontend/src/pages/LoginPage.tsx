import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Button } from "../components/Button";
import { PasswordInput } from "../components/PasswordInput";
import { extractErrorMessage } from "../services/api";
import { AuthLayout } from "../layouts/AuthLayout";
import { useAuth } from "../hooks/useAuth";

export function LoginPage() {
  const { login, status } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status === "authenticated") {
    const from = (location.state as { from?: string })?.from ?? "/dashboard";
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(extractErrorMessage(err, "Email ou senha inválidos."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-200"
          >
            Senha
          </label>
          <PasswordInput
            id="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-cartuga-500 focus:outline-none focus:ring-1 focus:ring-cartuga-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-50"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading} className="mt-2 w-full">
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </AuthLayout>
  );
}
