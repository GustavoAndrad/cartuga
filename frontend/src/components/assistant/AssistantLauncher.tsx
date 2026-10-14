import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { useCurrentConversation } from "../../hooks/useCurrentConversation";
import { XIcon } from "../table/icons";
import { AssistantAvatar, AssistantGlyph } from "./AssistantAvatar";
import { AssistantStatusLine } from "./AssistantStatusLine";
import { CollapseIcon, ExpandIcon, OpenPageIcon, PlusIcon } from "./icons";
import { ChatPanel } from "./ChatPanel";

const panelButton =
  "flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100";

/**
 * Floating Assistente Cartuga button + expandable chat pop-up, on every screen except
 * /assistant (which shows the same conversation full-size). Styled like the app's
 * primary buttons (brand green, flat logo turtle) so it reads as part of the UI; on
 * phones it's an icon-only circle and the pop-up takes the whole screen.
 */
export function AssistantLauncher() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [conversationId, setConversationId] = useCurrentConversation();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (location.pathname.startsWith("/assistant")) return null;

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label="Assistente Cartuga"
          className={`fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--color-surface)] shadow-2xl sm:inset-auto sm:bottom-[5.5rem] sm:right-6 sm:rounded-xl sm:border sm:border-neutral-300 sm:dark:border-neutral-700 ${
            expanded
              ? "sm:h-[min(calc(100vh-7.5rem),780px)] sm:w-[min(calc(100vw-3rem),760px)]"
              : "sm:h-[min(calc(100vh-7.5rem),580px)] sm:w-[400px]"
          }`}
        >
          <header className="flex items-center gap-2.5 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <AssistantAvatar className="h-9 w-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">Assistente Cartuga</p>
              <AssistantStatusLine className="max-w-full" />
            </div>
            <button type="button" onClick={() => setConversationId(null)} className={panelButton} title="Nova conversa" aria-label="Nova conversa">
              <PlusIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className={`${panelButton} hidden sm:flex`}
              title={expanded ? "Recolher" : "Expandir"}
              aria-label={expanded ? "Recolher" : "Expandir"}
            >
              {expanded ? <CollapseIcon className="h-4 w-4" /> : <ExpandIcon className="h-4 w-4" />}
            </button>
            <Link to="/assistant" onClick={() => setOpen(false)} className={panelButton} title="Abrir em página inteira" aria-label="Abrir em página inteira">
              <OpenPageIcon className="h-4 w-4" />
            </Link>
            <button type="button" onClick={() => setOpen(false)} className={panelButton} title="Fechar" aria-label="Fechar assistente">
              <XIcon className="h-4 w-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1">
            <ChatPanel conversationId={conversationId} onConversationChange={setConversationId} variant="popup" />
          </div>
        </section>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fechar Assistente Cartuga" : "Abrir Assistente Cartuga"}
        aria-expanded={open}
        title="Assistente Cartuga"
        className={`fixed bottom-5 right-5 z-40 flex h-12 items-center justify-center gap-2 rounded-full bg-cartuga-600 text-white shadow-lg shadow-black/20 transition-colors hover:bg-cartuga-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cartuga-400 focus-visible:ring-offset-2 dark:bg-cartuga-600 dark:hover:bg-cartuga-500 dark:focus-visible:ring-offset-neutral-900 sm:bottom-6 sm:right-6 sm:px-4 ${
          open ? "hidden w-12 sm:flex" : "w-12 sm:w-auto"
        }`}
      >
        {open ? (
          <XIcon className="h-5 w-5" />
        ) : (
          <>
            <AssistantGlyph className="h-6 w-6 text-white" cutColor="#265c30" />
            <span className="hidden text-sm font-medium sm:inline">Assistente</span>
          </>
        )}
      </button>
    </>
  );
}
