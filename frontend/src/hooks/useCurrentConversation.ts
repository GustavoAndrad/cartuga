import { useCallback, useState } from "react";

const STORAGE_KEY = "cartuga-assistant-conversation";

function read(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) || null : null;
  } catch {
    return null;
  }
}

/** The conversation the Assistente pop-up and page resume from - a per-browser
 * convenience only (the history itself lives on the server). */
export function useCurrentConversation(): [number | null, (id: number | null) => void] {
  const [id, setId] = useState<number | null>(read);
  const update = useCallback((next: number | null) => {
    setId(next);
    try {
      if (next === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // storage unavailable (private mode) - the in-memory state still works
    }
  }, []);
  return [id, update];
}
