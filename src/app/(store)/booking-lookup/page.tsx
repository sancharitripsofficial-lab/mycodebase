import type { Metadata } from "next";
import { BookingLookupClient } from "@/components/BookingLookupClient";

export const metadata: Metadata = {
  title: "My Booking Lookup",
  robots: { index: false, follow: false },
};

export default async function BookingLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; email?: string; token?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14 space-y-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-copper-700">
          Customer Receipt &amp; Self-Service
        </p>
        <h1 className="font-display text-3xl font-semibold text-forest-900">
          Find &amp; Manage Your Booking
        </h1>
        <p className="text-sm text-stone-600">
          Enter your booking reference and checkout email to view your own reservation receipt,
          traveler roster, comfort request status, or submit a reschedule/cancellation request.
          Other travelers’ personal details are never displayed.
        </p>
      </div>

      <BookingLookupClient
        initialRef={params.ref}
        initialEmail={params.email}
        initialToken={params.token}
      />
    </div>
  );
}

