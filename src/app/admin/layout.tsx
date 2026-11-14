import type { Metadata } from "next";
// Astryx component styles (buttons, inputs, switches...) for the whole admin panel.
import "@/styles/astryx-components.css";
import { AstryxShell } from "@/components/AstryxShell";

export const metadata: Metadata = {
  title: { default: "Sanchari Admin", template: "%s | Sanchari Admin" },
  robots: { index: false, follow: false, nocache: true },
};

/** Separate admin area: no storefront header, footer or links in either direction. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AstryxShell>
      <div className="min-h-screen bg-[#eef4f7]">{children}</div>
    </AstryxShell>
  );
}
