import type { ReactNode } from "react";

import logoLight from "../assets/logo/cartuga-logo-light.svg";
import logoDark from "../assets/logo/cartuga-logo-dark.svg";
import { useTheme } from "../hooks/useTheme";

export function AuthLayout({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <img src={theme === "dark" ? logoDark : logoLight} alt="Cartuga" className="h-12" />
        </div>
        <div className="rounded-xl border border-neutral-300 bg-[var(--color-surface)] p-6 shadow-sm dark:border-neutral-800">
          {children}
        </div>
      </div>
    </div>
  );
}
