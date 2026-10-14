import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import logoLight from "../assets/logo/cartuga-logo-light.svg";
import logoDark from "../assets/logo/cartuga-logo-dark.svg";
import { Avatar } from "../components/Avatar";
import { CurrencySelector } from "../components/CurrencySelector";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { AssistantLauncher } from "../components/assistant/AssistantLauncher";
import { getPendingReview } from "../services/planningApi";

const ICON_CLASS = "h-5 w-5 shrink-0";

const ICONS = {
  assistant: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON_CLASS}>
      <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v10h2v1.8L8.3 16H20V6H4Zm3 3h10v2H7V9Zm0 3h7v2H7v-2Z" />
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON_CLASS}>
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
    </svg>
  ),
  entries: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON_CLASS}>
      <path d="M12 4l6 6h-4v8h-4v-8H6l6-6Z" />
    </svg>
  ),
  expenses: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON_CLASS}>
      <path d="M12 20l-6-6h4V6h4v8h4l-6 6Z" />
    </svg>
  ),
  vault: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON_CLASS}>
      <path fillRule="evenodd" clipRule="evenodd" d="M4 3h16v18H4V3Zm1.5 1.5v15h13v-15h-13Z" />
      <circle cx="12" cy="12" r="3.5" />
      <rect x="11.3" y="8.3" width="1.4" height="2" />
      <rect x="6" y="5.5" width="2" height="1.4" />
      <rect x="16" y="5.5" width="2" height="1.4" />
    </svg>
  ),
  planning: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON_CLASS}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z" />
      <path d="M11 7h2v5.4l4 2.3-1 1.7-5-2.9V7Z" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON_CLASS}>
      <path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12Zm0 2.5c-3.3 0-9.8 1.6-9.8 4.9v2.4h19.6v-2.4c0-3.3-6.5-4.9-9.8-4.9Z" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON_CLASS}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5c0 1.7-3.6 3-8 3S4 6.7 4 5Z" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6c0 1.7-3.6 3-8 3s-8-1.3-8-3Z" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="currentColor" className={ICON_CLASS}>
      <path d="M11 3a1 1 0 0 1 1 1v2h-2V5H6v14h4v-1h2v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6Z" />
      <path d="M15.3 8.3 19 12l-3.7 3.7-1.4-1.4L15.2 13H9v-2h6.2l-1.3-1.3 1.4-1.4Z" />
    </svg>
  ),
};

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard", icon: ICONS.dashboard },
  { to: "/entries", label: "Entradas", icon: ICONS.entries },
  { to: "/expenses", label: "Saídas", icon: ICONS.expenses },
  { to: "/vault", label: "Cofre", icon: ICONS.vault },
  { to: "/planning", label: "Planejamentos", icon: ICONS.planning },
  { to: "/assistant", label: "Assistente", icon: ICONS.assistant },
  { to: "/profile", label: "Perfil", icon: ICONS.profile },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: pendingReview } = useQuery({
    queryKey: ["planning", "pending"],
    queryFn: getPendingReview,
    refetchInterval: 5 * 60 * 1000,
  });
  const pendingCount = pendingReview ? pendingReview.entries.length + pendingReview.expenses.length : 0;

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
  }

  useEffect(() => {
    if (!menuOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
      isActive
        ? "bg-neutral-100 text-cartuga-700 dark:bg-neutral-800 dark:text-cartuga-300"
        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800/60"
    }`;

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="sticky top-0 z-30 border-b border-neutral-300 bg-[var(--color-surface)] dark:border-neutral-800">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to="/dashboard" className="shrink-0 transition-opacity hover:opacity-80">
            <img src={theme === "dark" ? logoDark : logoLight} alt="Cartuga" className="h-8" />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <CurrencySelector />
            <ThemeToggle />

            <span className="hidden h-6 w-px bg-neutral-300 dark:bg-neutral-700 sm:block" />

            {/* Hidden on very narrow phones so the menu button stays on screen - Perfil is in the menu. */}
            <Link
              to="/profile"
              className="hidden items-center gap-2 rounded-lg p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 min-[360px]:flex"
            >
              <Avatar photo={user?.photo ?? null} name={user?.name ?? ""} />
              <span className="hidden text-sm font-medium text-neutral-700 dark:text-neutral-200 sm:inline">
                {user?.name}
              </span>
            </Link>

            <button
              onClick={() => setMenuOpen(true)}
              aria-label={
                pendingCount > 0 ? `Abrir menu (${pendingCount} planejamento(s) aguardando revisão)` : "Abrir menu"
              }
              aria-expanded={menuOpen}
              className="relative rounded-lg p-2 text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                <path d="M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z" />
              </svg>
              {pendingCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <div
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col bg-[var(--color-surface)] shadow-xl transition-transform duration-300 ease-in-out ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Menu</span>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Fechar menu"
            className="rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6 6.4 5Z" />
            </svg>
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)} className={navItemClass}>
              {link.icon}
              {link.label}
              {link.to === "/planning" && pendingCount > 0 && (
                <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
          {user?.role === "ADMIN" && (
            <NavLink to="/admin" onClick={() => setMenuOpen(false)} className={navItemClass}>
              {ICONS.admin}
              Gerenciamento
            </NavLink>
          )}
        </nav>

        <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            {ICONS.logout}
            Sair
          </button>
        </div>
      </aside>

      {/* Bottom padding keeps the last content clear of the floating assistant button. */}
      <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>

      <AssistantLauncher />
    </div>
  );
}
