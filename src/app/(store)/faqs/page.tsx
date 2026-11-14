import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { PageBanner3D } from "@/components/banners/PageBanner3D";
import { getSiteSettings } from "@/lib/data/repository";

export const metadata: Metadata = {
  title: "FAQs",
  description: "Answers before you book a Sanchari micro trip: luggage space, pickup timing, private 6-seat dates and more.",
  alternates: { canonical: "/faqs" },
};

/**
 * Frequently asked questions. The questions and answers come from Admin → Website text → FAQs,
 * and the top text from Admin → Home page → "FAQs page", so the owner edits them in one place.
 * The same list also feeds the chat guide.
 */
export default async function FaqsPage() {
  const { settings } = await getSiteSettings();
  const head = settings.homePage.faqSection;
  const faqs = settings.faqs.filter((f) => f.question.trim() && f.answer.trim());

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <>
      {faqs.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}
      <PageBanner3D
        scene="contact"
        width="4xl"
        eyebrow={head.eyebrow || "FAQs"}
        title={head.title || "Frequently asked questions"}
        subtitle={head.body || undefined}
      />
      <div className="sec-kolam">
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6 sm:py-12">
          {faqs.length > 0 ? (
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.id}
                  id={faq.id}
                  className="group scroll-mt-24 rounded-2xl border border-white/70 bg-white/85 p-4 shadow-[var(--shadow-soft)] open:bg-white"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-semibold text-forest-900">
                    {faq.question}
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-peach-100 text-lg leading-none text-copper-700 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-stone-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-white/70 bg-white/85 p-5 text-sm text-stone-600">
              Questions and answers will appear here soon.
            </p>
          )}

          <div className="tile tile-lagoon flex flex-wrap items-center gap-3 p-5">
            <p className="min-w-0 flex-[1_1_14rem] font-display text-lg font-semibold text-forest-900">Still have a question?</p>
            <Link
              href="/contact"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-forest-900 px-5 py-2.5 text-center text-sm font-semibold text-forest-900 hover:bg-forest-900 hover:text-cream-50 sm:w-auto"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Contact &amp; support details
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
