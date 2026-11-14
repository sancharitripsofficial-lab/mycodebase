"use client";

import { Languages } from "lucide-react";
import { useLanguage, type Lang } from "./LanguageProvider";

const OPTIONS: { lang: Lang; label: string; name: string }[] = [
  { lang: "kn", label: "ಕನ್ನಡ", name: "Kannada" },
  { lang: "en", label: "EN", name: "English" },
];

/** ಕನ್ನಡ | EN switch at the top of every page. Never translated itself. */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang, loading } = useLanguage();
  return (
    <div
      role="group"
      aria-label="Language / ಭಾಷೆ"
      data-no-translate
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border border-stone-200 bg-white p-0.5 text-[13px] font-semibold shadow-sm ${className}`}
    >
      <Languages className="ml-1.5 hidden h-3.5 w-3.5 text-forest-700 min-[360px]:block" aria-hidden="true" />
      {OPTIONS.map((o) => {
        const active = lang === o.lang;
        return (
          <button
            key={o.lang}
            type="button"
            lang={o.lang}
            aria-pressed={active}
            aria-label={o.name === "Kannada" ? "ಕನ್ನಡ (Kannada)" : "English"}
            onClick={() => setLang(o.lang)}
            className={`min-h-9 rounded-full px-2.5 leading-none transition-colors ${
              active ? "bg-forest-900 text-white" : "text-forest-900 hover:bg-lagoon-100"
            } ${active && loading ? "opacity-70" : ""}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
