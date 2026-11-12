"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";

/**
 * Password box with an always-visible show/hide eye.
 * Edge's own reveal eye disappears once the field loses focus, so it is hidden (see globals.css)
 * and this button is used on every browser instead.
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete = "current-password",
  isRequired,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  isRequired?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink-900">
        {label}
        {isRequired && <span className="ml-1 text-xs font-normal text-stone-600">· Required</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          required={isRequired}
          autoComplete={autoComplete}
          spellCheck={false}
          autoCapitalize="none"
          onChange={(e) => onChange(e.target.value)}
          className="no-native-reveal w-full rounded-full border border-stone-300 bg-white py-2 pr-11 pl-4 text-sm text-ink-900 outline-none transition focus:border-forest-800 focus:ring-2 focus:ring-forest-800/20"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          title={visible ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-600 transition hover:bg-lagoon-100 hover:text-forest-900"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
