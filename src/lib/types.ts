import type { AssistantSettings } from "@/lib/assistant/settings";
import type { BlogPost } from "@/lib/blog";
import type { HomePageContent } from "@/lib/home-content";
export type Difficulty = "Easy" | "Moderate" | "Active";

export type DepartureType = "open_batch" | "women_only" | "private_charter";

export type DepartureStatus =
  | "open"
  | "filling_fast"
  | "last_seats"
  | "sold_out"
  | "cancelled"
  | "completed";

export type BookingMode = "batch_seats" | "private_vehicle";

export type BookingStatus =
  | "pending_payment"
  | "deposit_paid"
  | "confirmed"
  | "cancel_requested"
  | "cancelled"
  | "refunded"
  | "expired";

export type CoTravelerPreference =
  | "open_mixed"
  | "prefer_same_gender"
  | "request_women_only";

export type ComfortResolutionStatus =
  | "none_requested"
  | "pending_review"
  | "accommodated"
  | "not_feasible_notified"
  | "customer_accepted_alt"
  | "customer_rescheduled"
  | "customer_refunded";

export type RoomPreference =
  | "shared_same_gender"
  | "private_room_request"
  | "couple_friends_room_request";

export type SeatRowRequest = "no_preference" | "front_middle" | "rear_window";

export type StaffRole = "owner" | "ops" | "support";

export interface Trip {
  id: string;
  slug: string;
  title: string;
  destination: string;
  region: string;
  tagline: string;
  summary: string;
  durationDays: number;
  durationNights: number;
  difficulty: Difficulty;
  vibe: string;
  basePricePaise: number;
  privateGroupPricePaise: number | null;
  privateDiscountPercent: number;
  depositPercent: number | null;
  balanceDueDaysBefore: number;
  pickupCity: string;
  heroImageUrl: string;
  galleryUrls: string[];
  /** Instagram reels, YouTube videos or uploaded mp4s shown on the trip page. */
  videoLinks: VideoLink[];
  inclusions: string[];
  exclusions: string[];
  accommodationNotes: string;
  packingList: string[];
  safetyNotes: string;
  accessibilityNotes: string;
  isSampleDemo: boolean;
  isPublished: boolean;
  sortOrder: number;
}

export interface ItineraryDay {
  id: string;
  tripId: string;
  dayNumber: number;
  title: string;
  description: string;
  driveTimeEstimate: string;
  travelBufferNotes: string;
  mealsIncluded: string;
}

export interface PickupPoint {
  id: string;
  tripId: string;
  name: string;
  area: string;
  pickupTimeLabel: string;
  mapsUrl: string | null;
  isConfirmed: boolean;
  sortOrder: number;
}

export interface PublicDepartureAvailability {
  departureId: string;
  tripId: string;
  departureCode: string;
  startDate: string;
  endDate: string;
  maxCapacity: number;
  minOccupancy: number;
  departureType: DepartureType;
  status: DepartureStatus;
  bookingCutoffAt: string;
  preferenceDeadlineAt: string;
  priceOverridePaise: number | null;
  seatsTaken: number;
  seatsRemaining: number;
}

export interface TripWithDetails {
  trip: Trip;
  itinerary: ItineraryDay[];
  pickupPoints: PickupPoint[];
  departures: PublicDepartureAvailability[];
}

export interface TravelerInput {
  fullName: string;
  ageGroup: "adult" | "senior";
  /** Exact age in years (adults 18-59, seniors 60+); null on bookings made before it was asked. */
  ageYears?: number | null;
  emergencyContact: string;
  dietaryNotes?: string;
  seatRowRequest: SeatRowRequest;
  roomPreference: RoomPreference;
}

export interface BookingTraveler extends TravelerInput {
  id: string;
  bookingId: string;
  verificationChecked: boolean;
}

export interface ComfortPreferenceRecord {
  bookingId: string;
  coTravelerPreference: CoTravelerPreference;
  preferenceNotes: string | null;
  resolutionStatus: ComfortResolutionStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  consentRecordedAt: string;
}

export interface BookingRecord {
  id: string;
  bookingReference: string;
  departureId: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  bookingMode: BookingMode;
  seatsRequested: number;
  status: BookingStatus;
  currency: "INR";
  unitPricePaise: number;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  amountPaidPaise: number;
  amountDuePaise: number;
  /** Money given back so far (recorded refunds). */
  amountRefundedPaise?: number;
  balanceDueAt: string | null;
  holdExpiresAt: string | null;
  termsSnapshot: Record<string, unknown>;
  pricingSnapshot: Record<string, unknown>;
  pickupPointId: string | null;
  verificationStatus: "not_checked" | "checked";
  paymentProvider: string | null;
  rescheduleRequestedNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerBookingView {
  booking: BookingRecord;
  trip: Pick<Trip, "id" | "slug" | "title" | "destination" | "pickupCity" | "isSampleDemo">;
  departure: PublicDepartureAvailability;
  pickupPoint: PickupPoint | null;
  travelers: BookingTraveler[];
  comfortSummaryLabel: string;
  comfortResolutionStatus: ComfortResolutionStatus;
  assignedSeatCount: number;
  /** Exact seat numbers on the car map (filled by the lookup API). */
  seatNumbers?: number[];
  /** Driver / vehicle / group link, shared only with paid bookings close to the trip. */
  crew?: import("@/lib/data/owner-ops").CustomerTripCrew | null;
  /** Sanchari's public WhatsApp Channel, when the owner has set it. */
  whatsappChannelUrl?: string;
}

export interface WaitlistEntry {
  id: string;
  departureId: string;
  fullName: string;
  email: string;
  phone: string;
  seatsNeeded: number;
  whatsappOptIn: boolean;
  status: "waiting" | "notified" | "converted" | "cancelled";
  consentRecordedAt: string;
  createdAt: string;
}

export interface VerifiedReview {
  id: string;
  tripId: string | null;
  authorName: string;
  departureLabel: string | null;
  rating: number;
  quote: string;
  isVerifiedAuthentic: boolean;
  isPublished: boolean;
  createdAt: string;
}

export interface VideoLink {
  label: string;
  url: string;
}

export interface SocialLinks {
  instagramUrl: string;
  youtubeUrl: string;
  facebookUrl: string;
  /** Digits only with country code, e.g. 919876543210. Used for the WhatsApp chat button. */
  whatsappNumber: string;
  /** Public WhatsApp Channel link (https://whatsapp.com/channel/...) for "Follow us" buttons. */
  whatsappChannelUrl: string;
}

export interface SiteSettings {
  brandIdentity: {
    brandName: string;
    headline: string;
    subheadline: string;
    baseCity: string;
    supportHours: string;
    legalEntityName: string;
    registeredAddress: string;
    supportEmail: string;
    whatsappDisplay: string;
    isCopyDraft: boolean;
  };
  bookingPolicy: {
    maxGroupSize: number;
    holdMinutes: number;
    gstIncludedOrNote: string;
    taxRatePercent: number;
    allowDepositCheckout: boolean;
    depositPercent: number;
    balanceDueDaysBefore: number;
    cancellationSlabs: { label: string; refundNote: string }[];
    preferenceDecisionHoursBefore: number;
    roomPolicySummary: string;
    vehiclePolicySummary: string;
    policyVersion: string;
  };
  faqs: { id: string; question: string; answer: string }[];
  socialLinks: SocialLinks;
  /** Home page words, cards and trip categories (Admin → Website text → Home page). */
  homePage: HomePageContent;
  /** Website chat guide: name, greeting, customer care number, quick questions, character media (Admin → Website text → Chat guide). */
  assistant: AssistantSettings;
  /** Owner's Kannada wording (English text → Kannada), on top of the built-in translations (Admin → Kannada). */
  translationsKn: Record<string, string>;
  /** Blog / trip stories with videos (Admin → Website → Blog & videos). */
  blogPosts: BlogPost[];
  legalDrafts: {
    ownerReviewRequired: boolean;
    termsSummary: string;
    privacySummary: string;
    refundSummary: string;
    safetySummary: string;
  };
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminBookingRow {
  booking: BookingRecord;
  tripTitle: string;
  departureCode: string;
  departureStartDate: string;
  pickupName: string | null;
  travelers: BookingTraveler[];
  comfortPreference: ComfortPreferenceRecord | null;
  /** Seats this booking holds or owns, lowest first. */
  seatNumbers: number[];
  /** Signed My Booking token so staff can send the customer a working link. */
  lookupToken?: string;
}

// ---------------------------------------------------------------------------
// Direct UPI payments (owner's own UPI ID + customer's 12-digit UTR + staff check)
// ---------------------------------------------------------------------------

export type PaymentStatus =
  | "created"
  | "authorized"
  | "submitted"
  | "captured"
  | "rejected"
  | "failed"
  | "refunded";

export type PaymentType = "full" | "deposit" | "balance";

export type UpiReviewDecision = "confirm" | "reject_retry" | "reject_cancel" | "refund_late";

export interface UpiPaymentSettings {
  isEnabled: boolean;
  upiId: string;
  payeeName: string;
  supportPhone: string;
  updatedAt: string | null;
}

export interface PaymentRecord {
  id: string;
  bookingId: string;
  provider: string;
  amountPaise: number;
  paymentType: PaymentType;
  status: PaymentStatus;
  utr: string | null;
  paidToUpiId: string | null;
  paidToName: string | null;
  submittedAt: string | null;
  lateAfterHold: boolean;
  seatsLost: boolean;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  /** upi (customer sent UTR), cash / bank_transfer / upi_manual (recorded by staff), gateway. */
  method?: "upi" | "cash" | "bank_transfer" | "upi_manual" | "gateway";
  /** Receipt / bank reference typed by staff for payments they recorded. */
  staffReference?: string | null;
}

/** What a customer may see about their own payments (UTR masked, no staff identity). */
export interface CustomerPaymentSummary {
  id: string;
  amountPaise: number;
  paymentType: PaymentType;
  status: PaymentStatus;
  utrMasked: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  customerNote: string | null;
  seatsLost: boolean;
}

export interface UpiPaymentInstructions {
  upiId: string;
  payeeName: string;
  supportPhone: string | null;
  amountPaise: number;
  note: string;
  upiUri: string;
  qrDataUrl: string;
  holdExpiresAt: string | null;
}

export interface UpiSubmitResult {
  paymentId: string;
  amountPaise: number;
  lateAfterHold: boolean;
  seatsLost: boolean;
  bookingStatus: BookingStatus;
}

export interface UpiReviewResult {
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  amountPaidPaise: number;
  amountDuePaise: number;
}

export interface AdminPaymentRow {
  payment: PaymentRecord;
  bookingId: string;
  bookingReference: string;
  bookingStatus: BookingStatus;
  bookingTotalPaise: number;
  bookingPaidPaise: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  tripTitle: string;
  departureCode: string;
  departureStartDate: string;
  seatsRequested: number;
}

