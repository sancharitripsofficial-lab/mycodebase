/** WhatsApp click-to-chat helpers for staff (no API, no cost: opens WhatsApp with a ready message). */

/** 10-digit Indian mobile → "91XXXXXXXXXX"; anything else → null. */
export function waNumber(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(d)) return `91${d}`;
  if (/^91[6-9]\d{9}$/.test(d)) return d;
  if (/^0[6-9]\d{9}$/.test(d)) return `91${d.slice(1)}`;
  return null;
}

export function waLink(phone: string, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

export function myBookingUrl(siteUrl: string, reference: string, email: string, token?: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const q = new URLSearchParams({ ref: reference, email });
  if (token) q.set("token", token);
  return `${base}/booking-lookup?${q.toString()}`;
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: paise % 100 ? 2 : 0 })}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

export function balanceReminderText(p: {
  customerName: string;
  tripTitle: string;
  departureCode: string;
  startDate: string;
  amountDuePaise: number;
  balanceDueAt: string | null;
  upiId: string | null;
  bookingUrl: string;
}): string {
  const by = p.balanceDueAt
    ? ` by ${new Date(p.balanceDueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
    : "";
  const pay = p.upiId
    ? `You can pay by UPI to ${p.upiId}, then enter the 12-digit UPI reference (UTR) on your booking page`
    : "Please open your booking page to pay";
  return [
    `Hi ${firstName(p.customerName)}, this is Sanchari Micro Trips.`,
    `Your ${p.tripTitle} trip (${p.departureCode}, ${p.startDate}) has a balance of ${rupees(p.amountDuePaise)}${by}.`,
    `${pay}: ${p.bookingUrl}`,
    "Thank you! Reply here if you have any questions.",
  ].join("\n");
}

export function tripDetailsText(p: {
  customerName: string;
  tripTitle: string;
  departureCode: string;
  startDate: string;
  seatNumbers: number[];
  pickupName: string | null;
  driverName: string;
  driverPhone: string;
  vehicleNumber: string;
  whatsappGroupUrl: string;
  reportingNote: string;
  bookingUrl: string;
}): string {
  const lines = [
    `Hi ${firstName(p.customerName)}, your Sanchari trip ${p.tripTitle} (${p.departureCode}) starts on ${p.startDate}.`,
  ];
  if (p.seatNumbers.length) lines.push(`Your seat${p.seatNumbers.length === 1 ? "" : "s"}: ${p.seatNumbers.join(", ")}`);
  if (p.pickupName) lines.push(`Pickup: ${p.pickupName}`);
  if (p.vehicleNumber) lines.push(`Vehicle: ${p.vehicleNumber}`);
  if (p.driverName || p.driverPhone) lines.push(`Driver: ${[p.driverName, p.driverPhone].filter(Boolean).join(", ")}`);
  if (p.reportingNote) lines.push(p.reportingNote);
  if (p.whatsappGroupUrl) lines.push(`Trip group: ${p.whatsappGroupUrl}`);
  lines.push(`Booking details: ${p.bookingUrl}`);
  return lines.join("\n");
}
