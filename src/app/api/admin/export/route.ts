import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { getAdminOperationsData } from "@/lib/data/repository";
import { sanitizeCsvCell } from "@/lib/privacy";

export async function GET() {
  try {
    await requireStaff(["owner", "ops"]);
  } catch {
    return NextResponse.json({ error: "Owner or Operations authorization required." }, { status: 403 });
  }

  // Explicitly exclude co-traveler comfort preferences from general roster CSV exports
  const { bookings } = await getAdminOperationsData(false);

  const headers = [
    "Booking Reference",
    "Departure Code",
    "Start Date",
    "Trip",
    "Lead Customer",
    "Email",
    "Phone",
    "Booking Mode",
    "Seats",
    "Status",
    "Total INR",
    "Paid INR",
    "Verification Status",
    "Pickup Hub",
  ];

  const rows = bookings.map((row) =>
    [
      row.booking.bookingReference,
      row.departureCode,
      row.departureStartDate,
      row.tripTitle,
      row.booking.customerName,
      row.booking.customerEmail,
      row.booking.customerPhone,
      row.booking.bookingMode,
      row.booking.seatsRequested,
      row.booking.status,
      (row.booking.totalPaise / 100).toFixed(2),
      (row.booking.amountPaidPaise / 100).toFixed(2),
      row.booking.verificationStatus,
      row.pickupName ?? "Unassigned",
    ]
      .map(sanitizeCsvCell)
      .join(",")
  );

  const csv = [headers.map(sanitizeCsvCell).join(","), ...rows].join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sanchari-roster-privacy-safe.csv"',
      "Cache-Control": "no-store",
    },
  });
}

