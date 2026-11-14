/**
 * App-wide wrapper. The Astryx Theme (~140 KB of JavaScript) is no longer loaded on every page:
 * public pages get the theme attributes statically on <html> (src/app/layout.tsx) and only the
 * screens that use Astryx components wrap themselves in <AstryxShell> (admin, booking lookup,
 * UPI pay panel).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
