"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DomTranslator, type Dictionary } from "@/lib/i18n/dom-translator";

export type Lang = "en" | "kn";

/** Remembered on this phone / browser (and in a cookie, for the server later). */
export const LANG_STORE_KEY = "sanchari-lang";

interface LanguageState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** True while the Kannada words are being fetched the first time. */
  loading: boolean;
}

const LanguageContext = createContext<LanguageState>({ lang: "en", setLang: () => {}, loading: false });

export const useLanguage = () => useContext(LanguageContext);

/**
 * Runs before the page paints (inline in the store layout): marks <html> as Kannada for a
 * returning Kannada visitor, so the CSS can hold the page back for a moment instead of
 * flashing English. Kept tiny and dependency-free on purpose.
 */
export const EARLY_LANG_SCRIPT = `try{var q=new URLSearchParams(location.search).get("lang");var l=q==="kn"||q==="en"?q:localStorage.getItem("${LANG_STORE_KEY}");if(l==="kn"){document.documentElement.setAttribute("data-lang","kn");document.documentElement.lang="kn";}}catch(e){}`;

let dictPromise: Promise<Dictionary> | null = null;

/** Built-in Kannada (shipped with the site) + the owner's corrections from Admin (newer wins). */
function loadDictionary(): Promise<Dictionary> {
  dictPromise ??= Promise.all([
    import("@/lib/i18n/kn.json").then((m) => (m.default ?? m) as Record<string, string>),
    fetch("/api/i18n", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ kn?: Record<string, string> }>) : { kn: {} }))
      .catch(() => ({ kn: {} as Record<string, string> })),
  ])
    .then(([builtIn, saved]) => {
      const dict: Dictionary = new Map();
      for (const [en, kn] of Object.entries(builtIn)) if (typeof kn === "string" && kn.trim()) dict.set(en, kn);
      for (const [en, kn] of Object.entries(saved.kn ?? {})) if (typeof kn === "string" && kn.trim()) dict.set(en.replace(/\s+/g, " ").trim(), kn);
      return dict;
    })
    .catch((err) => {
      dictPromise = null; // try again next time
      throw err;
    });
  return dictPromise;
}

function markHtml(lang: Lang, ready: boolean) {
  const html = document.documentElement;
  html.lang = lang;
  html.setAttribute("data-lang", lang);
  if (ready) html.setAttribute("data-i18n-ready", "");
  else html.removeAttribute("data-i18n-ready");
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start as English so the first render matches the server HTML (no hydration errors).
  const [lang, setLangState] = useState<Lang>("en");
  const [loading, setLoading] = useState(false);
  const translator = useRef<DomTranslator | null>(null);
  const wanted = useRef<Lang>("en");

  const apply = useCallback(async (next: Lang) => {
    wanted.current = next;
    if (next === "en") {
      translator.current?.stop();
      translator.current = null;
      markHtml("en", true);
      return;
    }
    markHtml("kn", false);
    setLoading(true);
    try {
      const dict = await loadDictionary();
      if (wanted.current !== "kn") return; // switched back while loading
      translator.current?.stop();
      translator.current = new DomTranslator(document.body, dict);
      translator.current.start();
    } catch {
      // Words could not load (offline): stay readable in English.
      markHtml("en", true);
      wanted.current = "en";
      setLangState("en");
    } finally {
      setLoading(false);
      if (wanted.current === "kn") markHtml("kn", true);
    }
  }, []);

  // The visitor's earlier choice (or ?lang=kn in a shared link).
  useEffect(() => {
    let stored: string | null = null;
    try {
      const q = new URLSearchParams(window.location.search).get("lang");
      if (q === "kn" || q === "en") {
        // A shared ?lang= link also sets the choice for the rest of the visit.
        stored = q;
        window.localStorage.setItem(LANG_STORE_KEY, q);
        document.cookie = `${LANG_STORE_KEY}=${q}; path=/; max-age=31536000; samesite=lax`;
      } else {
        stored = window.localStorage.getItem(LANG_STORE_KEY);
      }
    } catch {
      /* storage blocked */
    }
    if (stored === "kn") setLangState("kn");
    else markHtml("en", true);
  }, []);

  useEffect(() => {
    void apply(lang);
  }, [lang, apply]);

  // Leaving the storefront (e.g. to the admin panel): English page, nothing left running.
  useEffect(
    () => () => {
      translator.current?.stop();
      translator.current = null;
      markHtml("en", true);
    },
    [],
  );

  const setLang = useCallback((next: Lang) => {
    try {
      window.localStorage.setItem(LANG_STORE_KEY, next);
      document.cookie = `${LANG_STORE_KEY}=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* storage blocked: still switches for this page */
    }
    setLangState(next);
  }, []);

  return <LanguageContext.Provider value={{ lang, setLang, loading }}>{children}</LanguageContext.Provider>;
}
