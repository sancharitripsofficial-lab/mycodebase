import Image from "next/image";
import { getDeveloperCredit } from "@/lib/data/repository";
import { DEFAULT_DEVELOPER_CREDIT_URL, isHttpsUrl } from "@/lib/developer-credit";

export const DEVELOPER_CREDIT_LABEL = "Designed & Developed by";
export const DEVELOPER_CREDIT_NAME = "K S Indra Kumar — portfolio";

/** The credit line itself: words + the round gold-ring badge linking to the developer's portfolio. */
export function DeveloperCreditLine({ url }: { url: string }) {
  const href = isHttpsUrl(url) ? url : DEFAULT_DEVELOPER_CREDIT_URL;
  return (
    <p className="mt-2 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[11px] tracking-wide text-white/80 max-[359px]:flex-col">
      <span>{DEVELOPER_CREDIT_LABEL}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={DEVELOPER_CREDIT_NAME}
        title={DEVELOPER_CREDIT_NAME}
        data-no-translate
        className="group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f8d66e]"
      >
        <Image
          src="/brand/dev-badge.svg"
          alt=""
          width={34}
          height={34}
          unoptimized
          className="h-[34px] w-[34px] rounded-full shadow-[0_1px_4px_rgb(0_0_0/0.35)] transition duration-200 ease-out group-hover:scale-110 group-hover:shadow-[0_0_14px_rgb(248_214_110/0.6)] group-focus-visible:shadow-[0_0_14px_rgb(248_214_110/0.6)] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </a>
    </p>
  );
}

/** Footer credit, hidden when the owner switches it off in Admin → Website text → Footer credit. */
export async function DeveloperCredit() {
  const credit = await getDeveloperCredit();
  if (!credit.enabled) return null;
  return <DeveloperCreditLine url={credit.url} />;
}
