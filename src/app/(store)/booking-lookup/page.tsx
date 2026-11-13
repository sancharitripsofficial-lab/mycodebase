import type { Metadata } from "next";
import { PageBanner3D } from "@/components/banners/PageBanner3D";
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
    <>
      <PageBanner3D
        scene="booking"
        width="4xl"
        eyebrow="Customer Receipt & Self-Service"
        title="Find & Manage Your Booking"
        subtitle="View your own reservation receipt, traveler roster and comfort request status."
      />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 space-y-6">
        <p className="text-sm text-stone-600">
          Enter your booking reference and checkout email to view your own reservation receipt,
          traveler roster, comfort request status, or submit a reschedule/cancellation request.
          Other travelers’ personal details are never displayed.
        </p>

        <BookingLookupClient
          initialRef={params.ref}
          initialEmail={params.email}
          initialToken={params.token}
        />
      </div>
    </>
  );
}
