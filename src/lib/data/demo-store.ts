import { DEFAULT_ASSISTANT_SETTINGS } from "@/lib/assistant/settings";
import { DEFAULT_HOME_CONTENT } from "@/lib/home-content";
import crypto from "node:crypto";
import { calculateBookingPricing } from "@/lib/currency";
import { getSafeComfortCustomerLabel } from "@/lib/privacy";
import type {
  AdminBookingRow,
  AuditLogEntry,
  BookingRecord,
  BookingTraveler,
  CoTravelerPreference,
  ComfortPreferenceRecord,
  ComfortResolutionStatus,
  CustomerBookingView,
  DepartureStatus,
  DepartureType,
  ItineraryDay,
  PaymentRecord,
  PickupPoint,
  PublicDepartureAvailability,
  SiteSettings,
  Trip,
  TripWithDetails,
  UpiPaymentSettings,
  VerifiedReview,
  WaitlistEntry,
} from "@/lib/types";

export interface SeatAllocRow {
  id: string;
  departureId: string;
  bookingId: string | null;
  seatNumber: number;
  allocationStatus: "held" | "confirmed" | "operator_blocked" | "released";
  holdExpiresAt: string | null;
  reason: string | null;
}

export interface PaymentRow extends PaymentRecord {
  providerOrderId: string | null;
  providerPaymentId: string | null;
  idempotencyKey: string;
}

export interface RefundRow {
  id: string;
  bookingId: string;
  paymentId: string;
  amountPaise: number;
  reason: string;
  processedBy: string;
  createdAt: string;
}

interface DepartureRow {
  id: string;
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
  isPublished: boolean;
}

export interface DemoDatabaseState {
  settings: SiteSettings;
  upiSettings: UpiPaymentSettings;
  refunds: RefundRow[];
  trips: Trip[];
  itineraryDays: ItineraryDay[];
  pickupPoints: PickupPoint[];
  departures: DepartureRow[];
  seatAllocations: SeatAllocRow[];
  bookings: BookingRecord[];
  travelers: BookingTraveler[];
  comfortPreferences: ComfortPreferenceRecord[];
  payments: PaymentRow[];
  waitlist: WaitlistEntry[];
  reviews: VerifiedReview[];
  auditLogs: AuditLogEntry[];
}

function createInitialDemoState(): DemoDatabaseState {
  const trips: Trip[] = [
    {
      id: "11111111-1111-4111-8111-111111111101",
      slug: "chikmagalur-coffee-trails",
      title: "Chikmagalur Coffee & Mist Trails",
      destination: "Chikmagalur, Karnataka",
      region: "Western Ghats",
      tagline:
        "Unhurried estate walks, monsoon-washed ridges, and filter coffee before the crowds arrive.",
      summary:
        "Sample itinerary: A calm 3-day weekend drive from Bengaluru into the Mullayanagiri foothills, staying at a small coffee-estate homestay with guided plantation walks and scenic ridge viewpoints.",
      durationDays: 3,
      durationNights: 2,
      difficulty: "Easy",
      vibe: "Slow hills & coffee culture",
      basePricePaise: 1150000,
      privateGroupPricePaise: 6200000,
      privateDiscountPercent: 10,
      depositPercent: null,
      balanceDueDaysBefore: 7,
      pickupCity: "Bengaluru",
      heroImageUrl: "/media/dest-chikmagalur.jpg",
      videoLinks: [],
      galleryUrls: [
        "/media/dest-chikmagalur.jpg",
        "/media/story-coffee-morning.jpg",
        "/media/hero-western-ghats.jpg",
      ],
      inclusions: [
        "Sample: 6-seat Ertiga-class AC transport from Bengaluru & back",
        "Sample: 2 nights at an estate homestay (room basis subject to confirmation)",
        "Sample: Estate breakfast & Malnad dinner as listed in itinerary",
        "Sample: Guided coffee plantation walk & driver allowances",
      ],
      exclusions: [
        "Sample: Highway lunches & personal cafe stops",
        "Sample: Entry tickets / jeep transfers if opted locally",
        "Sample: Personal travel insurance & incidental expenses",
      ],
      accommodationNotes:
        "Draft policy: Small family-run estate homestay. Solo travelers default to shared same-gender rooms when confirmed; private rooms subject to availability and supplement.",
      packingList: [
        "Light rain shell or windcheater",
        "Grippy walking shoes",
        "Reusable water bottle",
        "Light woollen layer for dawn ridges",
        "Motion-sickness medication if sensitive to ghat curves",
      ],
      safetyNotes:
        "Draft operational note: Daytime ghat driving only, planned rest breaks every 2.5 hours. Owner to confirm exact vehicle checklist & driver verification protocols.",
      accessibilityNotes:
        "Involves moderate walking on uneven coffee-estate paths and gentle steps; please flag mobility needs before booking so the team can advise.",
      isSampleDemo: true,
      isPublished: true,
      sortOrder: 1,
    },
    {
      id: "11111111-1111-4111-8111-111111111102",
      slug: "coorg-rainforest-slow-drive",
      title: "Kodagu Rainforest & Spice Drive",
      destination: "Kodagu (Coorg), Karnataka",
      region: "Western Ghats",
      tagline:
        "Pepper vines, misty shola valleys, and quiet backroads away from busy resort strips.",
      summary:
        "Sample itinerary: Three slow days across South Kodagu’s spice estates, shaded forest viewpoints, and traditional Kodava home-cooked meals with a group of no more than six.",
      durationDays: 3,
      durationNights: 2,
      difficulty: "Moderate",
      vibe: "Rainforest & culinary heritage",
      basePricePaise: 1240000,
      privateGroupPricePaise: 6690000,
      privateDiscountPercent: 10,
      depositPercent: null,
      balanceDueDaysBefore: 7,
      pickupCity: "Bengaluru",
      heroImageUrl: "/media/dest-coorg.jpg",
      videoLinks: [],
      galleryUrls: ["/media/dest-coorg.jpg", "/media/story-coffee-morning.jpg"],
      inclusions: [
        "Sample: Round-trip Ertiga-class road travel from Bengaluru",
        "Sample: 2 nights in a verified Kodagu estate stay",
        "Sample: Breakfasts & 1 curated estate dinner",
        "Sample: Spice-estate walk & route tolls/parking",
      ],
      exclusions: [
        "Sample: En-route lunches & specialty coffee tastings",
        "Sample: Optional forest entry permits",
        "Sample: Personal expenses",
      ],
      accommodationNotes:
        "Draft policy: Heritage plantation bungalow or cottages. Room sharing confirmed before departure.",
      packingList: [
        "Quick-dry trousers",
        "Closed-toe trail shoes",
        "Umbrella or poncho (Jun–Nov)",
        "Personal medications",
        "Small daypack",
      ],
      safetyNotes:
        "Draft operational note: Route avoids late-night forest stretches; emergency contact shared prior to pickup.",
      accessibilityNotes:
        "Includes short forest trails that can be slippery after rain. Not wheelchair accessible at estate verandahs.",
      isSampleDemo: true,
      isPublished: true,
      sortOrder: 2,
    },
    {
      id: "11111111-1111-4111-8111-111111111103",
      slug: "gokarna-coastal-headlands",
      title: "Gokarna Headlands & Quiet Coves",
      destination: "Gokarna, Coastal Karnataka",
      region: "Coastal Karnataka",
      tagline:
        "Laterite cliff paths, quiet morning swims, and slow coastal drives through Uttara Kannada.",
      summary:
        "Sample itinerary: An overnight-to-coast micro-expedition linking Bengaluru with Gokarna’s quieter headland trails, sunset cliffs, and local coastal kitchens.",
      durationDays: 3,
      durationNights: 2,
      difficulty: "Moderate",
      vibe: "Coastal cliffs & sea breeze",
      basePricePaise: 1290000,
      privateGroupPricePaise: 6950000,
      privateDiscountPercent: 10,
      depositPercent: null,
      balanceDueDaysBefore: 7,
      pickupCity: "Bengaluru",
      heroImageUrl: "/media/dest-gokarna.jpg",
      videoLinks: [],
      galleryUrls: ["/media/dest-gokarna.jpg", "/media/hero-western-ghats.jpg"],
      inclusions: [
        "Sample: AC 6-seat MPV travel from Bengaluru",
        "Sample: 2 nights coastal boutique stay",
        "Sample: Daily coastal breakfast",
        "Sample: Guided headland walk",
      ],
      exclusions: [
        "Sample: Beach shack lunches & dinners",
        "Sample: Ferry / water activities (weather dependent)",
        "Sample: Personal purchases",
      ],
      accommodationNotes:
        "Draft policy: Clean coastal guesthouse near quieter coves. AC/non-AC room category confirmed per departure.",
      packingList: [
        "Breathable cotton/linen clothing",
        "Sandals + trail sneakers",
        "Sunscreen & hat",
        "Dry bag for phone",
        "Light shawl for early morning drive",
      ],
      safetyNotes:
        "Draft operational note: Coastal swim stops are non-lifeguarded and strictly optional; headland walk follows daylight hours only.",
      accessibilityNotes:
        "Headland paths involve rocky steps and steep sun-exposed gradients; alternative viewpoint drops can be arranged by car.",
      isSampleDemo: true,
      isPublished: true,
      sortOrder: 3,
    },
    {
      id: "11111111-1111-4111-8111-111111111104",
      slug: "hampi-boulders-and-ruins",
      title: "Hampi Boulders & Sunrise Ruins",
      destination: "Hampi, Karnataka",
      region: "Heritage",
      tagline: "Granite ridges at first light, riverside ruins, and unhurried heritage storytelling.",
      summary:
        "Sample itinerary: A heritage-focused road trip to Hampi’s boulder landscapes and Vijayanagara stone precincts, paced around early mornings and golden-hour views.",
      durationDays: 3,
      durationNights: 2,
      difficulty: "Easy",
      vibe: "Heritage & golden-hour walks",
      basePricePaise: 1190000,
      privateGroupPricePaise: 6420000,
      privateDiscountPercent: 10,
      depositPercent: null,
      balanceDueDaysBefore: 7,
      pickupCity: "Bengaluru",
      heroImageUrl: "/media/dest-hampi.jpg",
      videoLinks: [],
      galleryUrls: ["/media/dest-hampi.jpg", "/media/story-coffee-morning.jpg"],
      inclusions: [
        "Sample: AC 6-seat MPV travel from Bengaluru",
        "Sample: 2 nights near Hampi/Anegundi",
        "Sample: Breakfasts",
        "Sample: Sunrise ridge walk & local heritage orientation",
      ],
      exclusions: [
        "Sample: ASI monument entry fees",
        "Sample: Lunches, dinners & coracle rides",
        "Sample: Camera fees if applicable",
      ],
      accommodationNotes: "Draft policy: Boutique guesthouse near Anegundi or Kamalapur.",
      packingList: [
        "Sun hat & sunglasses",
        "Comfortable walking sneakers",
        "Light breathable layers",
        "Electrolyte packets",
        "Power bank",
      ],
      safetyNotes:
        "Draft operational note: Midday heat breaks built into itinerary; sunrise ridge walks carry group flashlights.",
      accessibilityNotes:
        "Boulder viewpoints require steady footing on natural granite; main temple complexes are mostly flat stone pathways.",
      isSampleDemo: true,
      isPublished: true,
      sortOrder: 4,
    },
  ];

  const itineraryDays: ItineraryDay[] = [
    {
      id: "it-ckm-1",
      tripId: "11111111-1111-4111-8111-111111111101",
      dayNumber: 1,
      title: "Bengaluru to Chikmagalur Coffee Country",
      description:
        "Early morning pickup across confirmed Bengaluru hubs, breakfast stop along the Kunigal–Hassan highway, and afternoon check-in at the coffee estate followed by a slow estate walk.",
      driveTimeEstimate: "5.5 – 6.5 hrs (with breaks)",
      travelBufferNotes: "Includes 45-min breakfast & stretch buffer before ghat climb.",
      mealsIncluded: "Sample: Evening estate coffee & dinner",
    },
    {
      id: "it-ckm-2",
      tripId: "11111111-1111-4111-8111-111111111101",
      dayNumber: 2,
      title: "Misty Ridges, Shola Forests & Estate Hearth",
      description:
        "Dawn drive toward high-altitude viewpoints (weather & forest rules permitting), relaxed afternoon back at the homestay with Malnad lunch/coffee tasting and evening conversation.",
      driveTimeEstimate: "2.5 hrs local ghat loop",
      travelBufferNotes: "Buffer built in for fog clearance & single-lane ridge traffic.",
      mealsIncluded: "Sample: Breakfast & dinner",
    },
    {
      id: "it-ckm-3",
      tripId: "11111111-1111-4111-8111-111111111101",
      dayNumber: 3,
      title: "Morning Birdsong & Return to Bengaluru",
      description:
        "Unhurried estate breakfast, optional stop at a historic Hoysala shrine en route if time permits, arriving in Bengaluru by evening.",
      driveTimeEstimate: "6 – 7 hrs (Sunday return buffer)",
      travelBufferNotes: "45-min Nelamangala evening traffic cushion built into ETA.",
      mealsIncluded: "Sample: Breakfast",
    },
    {
      id: "it-crg-1",
      tripId: "11111111-1111-4111-8111-111111111102",
      dayNumber: 1,
      title: "Bengaluru to South Kodagu Spice Estates",
      description:
        "Morning departure via Mysuru bypass with traditional breakfast stop, arriving in South Kodagu by afternoon for estate check-in and pepper-vine walk.",
      driveTimeEstimate: "5.5 – 6.5 hrs",
      travelBufferNotes: "Includes Mysuru ring-road & coffee break buffer.",
      mealsIncluded: "Sample: Dinner",
    },
    {
      id: "it-crg-2",
      tripId: "11111111-1111-4111-8111-111111111102",
      dayNumber: 2,
      title: "Shola Valleys & Kodava Culinary Morning",
      description:
        "Morning forest-edge viewpoint, gentle stream walk, and an unhurried afternoon learning local spice harvests.",
      driveTimeEstimate: "2 hrs local drive",
      travelBufferNotes: "Weather-flexible schedule during monsoon months.",
      mealsIncluded: "Sample: Breakfast & curated estate dinner",
    },
    {
      id: "it-crg-3",
      tripId: "11111111-1111-4111-8111-111111111102",
      dayNumber: 3,
      title: "Filter Coffee Dawn & Drive Home",
      description:
        "Early breakfast on the verandah before cruising back toward Bengaluru with a lunch halt.",
      driveTimeEstimate: "6 – 7 hrs",
      travelBufferNotes: "Evening highway arrival buffer.",
      mealsIncluded: "Sample: Breakfast",
    },
    {
      id: "it-gok-1",
      tripId: "11111111-1111-4111-8111-111111111103",
      dayNumber: 1,
      title: "Bengaluru to Uttara Kannada Coast",
      description:
        "Early start via Chitradurga–Hubballi or Shimoga corridor, reaching the coastal stay by late afternoon for sunset on a quiet headland.",
      driveTimeEstimate: "8.5 – 9.5 hrs",
      travelBufferNotes: "Two planned highway meal & stretch stops.",
      mealsIncluded: "Sample: Light welcome refreshments",
    },
    {
      id: "it-gok-2",
      tripId: "11111111-1111-4111-8111-111111111103",
      dayNumber: 2,
      title: "Headland Trail & Cove Hopping",
      description:
        "Guided morning walk linking secluded coastal coves, relaxed afternoon rest out of peak sun, and golden-hour viewpoint.",
      driveTimeEstimate: "1 hr local transfers",
      travelBufferNotes: "Pace adjusts for coastal heat & tide timings.",
      mealsIncluded: "Sample: Breakfast",
    },
    {
      id: "it-gok-3",
      tripId: "11111111-1111-4111-8111-111111111103",
      dayNumber: 3,
      title: "Sunrise Shore & Return Drive",
      description:
        "Early morning beach walk and coastal breakfast before the scenic return drive to Bengaluru.",
      driveTimeEstimate: "8.5 – 9.5 hrs",
      travelBufferNotes: "Includes dinner halt before city entry.",
      mealsIncluded: "Sample: Breakfast",
    },
    {
      id: "it-hmp-1",
      tripId: "11111111-1111-4111-8111-111111111104",
      dayNumber: 1,
      title: "Bengaluru to the Tungabhadra Valley",
      description:
        "Smooth highway cruise north via Chitradurga, afternoon arrival near Hampi/Anegundi, and sunset atop a quiet granite hill.",
      driveTimeEstimate: "6.5 – 7.5 hrs",
      travelBufferNotes: "Includes breakfast & lunch highway halts.",
      mealsIncluded: "Sample: Arrival tea",
    },
    {
      id: "it-hmp-2",
      tripId: "11111111-1111-4111-8111-111111111104",
      dayNumber: 2,
      title: "Stone Mandapas & Riverine Ruins",
      description:
        "Sunrise exploration of Vijayanagara monuments before midday heat, afternoon pause by the river, and lantern-lit heritage walk.",
      driveTimeEstimate: "1.5 hrs local loop",
      travelBufferNotes: "Midday 3-hour rest buffer built in.",
      mealsIncluded: "Sample: Breakfast",
    },
    {
      id: "it-hmp-3",
      tripId: "11111111-1111-4111-8111-111111111104",
      dayNumber: 3,
      title: "Anegundi Village Morning & Return",
      description:
        "Morning stroll through Anegundi lanes and banana plantations, departing after brunch for Bengaluru.",
      driveTimeEstimate: "7 – 8 hrs",
      travelBufferNotes: "Evening highway arrival buffer.",
      mealsIncluded: "Sample: Breakfast",
    },
  ];

  const pickupPoints: PickupPoint[] = [
    {
      id: "33333333-3333-4333-8333-333333333301",
      tripId: "11111111-1111-4111-8111-111111111101",
      name: "Indiranagar 100ft Road (Sample Hub)",
      area: "East Bengaluru",
      pickupTimeLabel: "05:45 AM (Draft)",
      mapsUrl: null,
      isConfirmed: false,
      sortOrder: 1,
    },
    {
      id: "33333333-3333-4333-8333-333333333302",
      tripId: "11111111-1111-4111-8111-111111111101",
      name: "Yeshwanthpur Metro / Goraguntepalya (Sample Hub)",
      area: "West Bengaluru",
      pickupTimeLabel: "06:30 AM (Draft)",
      mapsUrl: null,
      isConfirmed: false,
      sortOrder: 2,
    },
    {
      id: "33333333-3333-4333-8333-333333333303",
      tripId: "11111111-1111-4111-8111-111111111102",
      name: "Indiranagar 100ft Road (Sample Hub)",
      area: "East Bengaluru",
      pickupTimeLabel: "05:45 AM (Draft)",
      mapsUrl: null,
      isConfirmed: false,
      sortOrder: 1,
    },
    {
      id: "33333333-3333-4333-8333-333333333304",
      tripId: "11111111-1111-4111-8111-111111111102",
      name: "Silk Board / Mysore Road Junction (Sample Hub)",
      area: "South-West Bengaluru",
      pickupTimeLabel: "06:30 AM (Draft)",
      mapsUrl: null,
      isConfirmed: false,
      sortOrder: 2,
    },
    {
      id: "33333333-3333-4333-8333-333333333305",
      tripId: "11111111-1111-4111-8111-111111111103",
      name: "Indiranagar 100ft Road (Sample Hub)",
      area: "East Bengaluru",
      pickupTimeLabel: "05:00 AM (Draft)",
      mapsUrl: null,
      isConfirmed: false,
      sortOrder: 1,
    },
    {
      id: "33333333-3333-4333-8333-333333333306",
      tripId: "11111111-1111-4111-8111-111111111103",
      name: "Hebbal / Yeshwanthpur Bypass (Sample Hub)",
      area: "North-West Bengaluru",
      pickupTimeLabel: "05:45 AM (Draft)",
      mapsUrl: null,
      isConfirmed: false,
      sortOrder: 2,
    },
    {
      id: "33333333-3333-4333-8333-333333333307",
      tripId: "11111111-1111-4111-8111-111111111104",
      name: "Indiranagar 100ft Road (Sample Hub)",
      area: "East Bengaluru",
      pickupTimeLabel: "05:30 AM (Draft)",
      mapsUrl: null,
      isConfirmed: false,
      sortOrder: 1,
    },
    {
      id: "33333333-3333-4333-8333-333333333308",
      tripId: "11111111-1111-4111-8111-111111111104",
      name: "Hebbal Ring Road (Sample Hub)",
      area: "North Bengaluru",
      pickupTimeLabel: "06:15 AM (Draft)",
      mapsUrl: null,
      isConfirmed: false,
      sortOrder: 2,
    },
  ];

  const departures: DepartureRow[] = [
    {
      id: "22222222-2222-4222-8222-222222222201",
      tripId: "11111111-1111-4111-8111-111111111101",
      departureCode: "SAN-CKM-DEC04",
      startDate: "2026-12-04",
      endDate: "2026-12-06",
      maxCapacity: 6,
      minOccupancy: 3,
      departureType: "open_batch",
      status: "filling_fast",
      bookingCutoffAt: "2026-12-02T12:30:00.000Z",
      preferenceDeadlineAt: "2026-12-01T12:30:00.000Z",
      priceOverridePaise: null,
      isPublished: true,
    },
    {
      id: "22222222-2222-4222-8222-222222222202",
      tripId: "11111111-1111-4111-8111-111111111101",
      departureCode: "SAN-CKM-DEC18",
      startDate: "2026-12-18",
      endDate: "2026-12-20",
      maxCapacity: 6,
      minOccupancy: 3,
      departureType: "open_batch",
      status: "open",
      bookingCutoffAt: "2026-12-16T12:30:00.000Z",
      preferenceDeadlineAt: "2026-12-15T12:30:00.000Z",
      priceOverridePaise: null,
      isPublished: true,
    },
    {
      id: "22222222-2222-4222-8222-222222222203",
      tripId: "11111111-1111-4111-8111-111111111102",
      departureCode: "SAN-CRG-DEC11",
      startDate: "2026-12-11",
      endDate: "2026-12-13",
      maxCapacity: 6,
      minOccupancy: 3,
      departureType: "women_only",
      status: "open",
      bookingCutoffAt: "2026-12-09T12:30:00.000Z",
      preferenceDeadlineAt: "2026-12-08T12:30:00.000Z",
      priceOverridePaise: null,
      isPublished: true,
    },
    {
      id: "22222222-2222-4222-8222-222222222204",
      tripId: "11111111-1111-4111-8111-111111111103",
      departureCode: "SAN-GOK-DEC25",
      startDate: "2026-12-25",
      endDate: "2026-12-27",
      maxCapacity: 6,
      minOccupancy: 3,
      departureType: "open_batch",
      status: "last_seats",
      bookingCutoffAt: "2026-12-23T12:30:00.000Z",
      preferenceDeadlineAt: "2026-12-22T12:30:00.000Z",
      priceOverridePaise: null,
      isPublished: true,
    },
    {
      id: "22222222-2222-4222-8222-222222222205",
      tripId: "11111111-1111-4111-8111-111111111104",
      departureCode: "SAN-HMP-JAN08",
      startDate: "2027-01-08",
      endDate: "2027-01-10",
      maxCapacity: 6,
      minOccupancy: 3,
      departureType: "open_batch",
      status: "open",
      bookingCutoffAt: "2027-01-06T12:30:00.000Z",
      preferenceDeadlineAt: "2027-01-05T12:30:00.000Z",
      priceOverridePaise: null,
      isPublished: true,
    },
    {
      id: "22222222-2222-4222-8222-222222222206",
      tripId: "11111111-1111-4111-8111-111111111102",
      departureCode: "SAN-CRG-NOV27",
      startDate: "2026-11-27",
      endDate: "2026-11-29",
      maxCapacity: 6,
      minOccupancy: 3,
      departureType: "open_batch",
      status: "sold_out",
      bookingCutoffAt: "2026-11-25T12:30:00.000Z",
      preferenceDeadlineAt: "2026-11-24T12:30:00.000Z",
      priceOverridePaise: null,
      isPublished: true,
    },
  ];

  const seatAllocations: SeatAllocRow[] = [
    ...[1, 2, 3].map((seatNumber) => ({
      id: `sa-dec04-${seatNumber}`,
      departureId: "22222222-2222-4222-8222-222222222201",
      bookingId: null,
      seatNumber,
      allocationStatus: "operator_blocked" as const,
      holdExpiresAt: null,
      reason: "Sample demo occupancy (3/6)",
    })),
    ...[1, 2, 3, 4, 5].map((seatNumber) => ({
      id: `sa-gok-${seatNumber}`,
      departureId: "22222222-2222-4222-8222-222222222204",
      bookingId: null,
      seatNumber,
      allocationStatus: "operator_blocked" as const,
      holdExpiresAt: null,
      reason: "Sample demo occupancy (5/6)",
    })),
    ...[1, 2, 3, 4, 5, 6].map((seatNumber) => ({
      id: `sa-nov27-${seatNumber}`,
      departureId: "22222222-2222-4222-8222-222222222206",
      bookingId: null,
      seatNumber,
      allocationStatus: "operator_blocked" as const,
      holdExpiresAt: null,
      reason: "Sample demo sold-out state (6/6)",
    })),
  ];

  const settings: SiteSettings = {
    brandIdentity: {
      brandName: "Sanchari • Micro Trips",
      headline: "Leave as strangers. Return as a story.",
      subheadline: "Curated Karnataka road trips, shared with no more than six travelers.",
      baseCity: "Bengaluru, Karnataka",
      supportHours: "[Owner to verify: e.g., Mon–Sun, 9:00 AM – 7:00 PM IST]",
      legalEntityName: "[Owner to verify legal entity name]",
      registeredAddress: "[Owner to verify Bengaluru office/registered address]",
      supportEmail: "[Owner to configure support email]",
      whatsappDisplay: "[Owner to configure WhatsApp support number]",
      isCopyDraft: true,
    },
    bookingPolicy: {
      maxGroupSize: 6,
      holdMinutes: 15,
      gstIncludedOrNote: "[Owner to confirm GST applicability and tax rate before launch]",
      taxRatePercent: 0,
      allowDepositCheckout: false,
      depositPercent: 30,
      balanceDueDaysBefore: 7,
      cancellationSlabs: [
        {
          label: "Draft: 14+ days before departure",
          refundNote: "[Owner to verify refund % / credit rule]",
        },
        {
          label: "Draft: 7–13 days before departure",
          refundNote: "[Owner to verify partial refund %]",
        },
        {
          label: "Draft: Under 7 days / no-show",
          refundNote: "[Owner to verify no-refund / emergency policy]",
        },
      ],
      preferenceDecisionHoursBefore: 72,
      roomPolicySummary:
        "For overnight stays, shared same-gender rooms are the default request for solo travelers when confirmed by the operator. Private or couple/friends rooms are subject to property availability and tariff confirmation.",
      vehiclePolicySummary:
        "Operated in an Ertiga-class 6-passenger MPV (exact vehicle registration, luggage allowance, and driver assignment shared only after owner confirmation).",
      policyVersion: "draft-v0.1-owner-review-required",
    },
    faqs: [
      {
        id: "faq-six-cap",
        question: "Why are departures capped at six travelers?",
        answer:
          "Every Sanchari trip travels in one comfortable Ertiga-sized MPV with a strict six-traveler limit. Smaller groups allow unhurried stops, easier conversation, and stays at intimate homestays rather than large coach-bus hotels.",
      },
      {
        id: "faq-solo",
        question: "Can I join solo, or as a duo or trio?",
        answer:
          "Yes. Most travelers join solo or in pairs (1–5 seats) on scheduled departures. If you are six friends or family, you can also book all six seats as a private vehicle when a departure has 6/6 seats free.",
      },
      {
        id: "faq-comfort",
        question: "How do co-traveler and room preferences work?",
        answer:
          "During checkout you can share optional co-traveler comfort and room requests. Preferences are handled privately by our operations team and are never shown publicly. Women-only departures are scheduled explicitly by our team—if a preference cannot be met by the decision deadline, you will be offered alternatives or a refund per the published policy.",
      },
      {
        id: "faq-pickup",
        question: "Where are Bengaluru pickup and drop points?",
        answer:
          "Sample pickup hubs are listed on each trip page. Exact confirmed pickup timings are locked by the operator before departure.",
      },
      {
        id: "faq-reviews",
        question: "Why are customer reviews not shown unless verified?",
        answer:
          "Sanchari publishes only authentic, operator-verified reviews from real completed trips. We never publish placeholder testimonials.",
      },
    ],
    socialLinks: { instagramUrl: "", youtubeUrl: "", facebookUrl: "", whatsappNumber: "", whatsappChannelUrl: "" },
    homePage: DEFAULT_HOME_CONTENT,
    assistant: DEFAULT_ASSISTANT_SETTINGS,
    legalDrafts: {
      ownerReviewRequired: true,
      termsSummary:
        "DRAFT FOR OWNER REVIEW: This platform facilitates small-group road trip reservations operated in Karnataka. Final terms covering force majeure, weather/ghat road diversions, traveler conduct, medical disclosure, and liability must be reviewed by legal counsel before going live.",
      privacySummary:
        "DRAFT FOR OWNER REVIEW: We collect only information necessary to operate your trip (contact details, emergency contact, pickup choice, and optional comfort/dietary requests). Co-traveler comfort preferences are access-restricted to operations staff and never shared publicly or with third-party marketers.",
      refundSummary:
        "DRAFT FOR OWNER REVIEW: Refunds and reschedules follow the slab snapshot attached to your booking at checkout. Payment gateway reversals typically settle within 5–7 business days once processed, subject to gateway rules.",
      safetySummary:
        "DRAFT FOR OWNER REVIEW: Safety protocols, driver rest limits, night-driving restrictions on ghat roads, first-aid kit checks, and manual verification-checked steps must be confirmed and audited by the business owner before publishing as guarantees.",
    },
  };

  return {
    settings,
    // Off until the owner enters their own UPI ID in Admin → UPI Settings.
    upiSettings: { isEnabled: false, upiId: "", payeeName: "", supportPhone: "", updatedAt: null },
    refunds: [],
    trips,
    itineraryDays,
    pickupPoints,
    departures,
    seatAllocations,
    bookings: [],
    travelers: [],
    comfortPreferences: [],
    payments: [],
    waitlist: [],
    reviews: [],
    auditLogs: [],
  };
}

const globalForDemo = globalThis as unknown as { __sanchariDemoState?: DemoDatabaseState };

export function getDemoState(): DemoDatabaseState {
  if (!globalForDemo.__sanchariDemoState) {
    globalForDemo.__sanchariDemoState = createInitialDemoState();
  }
  return globalForDemo.__sanchariDemoState;
}

export function resetDemoStateForTests(): DemoDatabaseState {
  globalForDemo.__sanchariDemoState = createInitialDemoState();
  return globalForDemo.__sanchariDemoState;
}

export function releaseExpiredHoldsDemo(state: DemoDatabaseState, departureId: string): void {
  const now = Date.now();
  const expiredBookingIds = new Set<string>();

  for (const booking of state.bookings) {
    if (
      booking.departureId === departureId &&
      booking.status === "pending_payment" &&
      booking.holdExpiresAt &&
      Date.parse(booking.holdExpiresAt) <= now
    ) {
      booking.status = "expired";
      booking.updatedAt = new Date().toISOString();
      expiredBookingIds.add(booking.id);
    }
  }

  for (const alloc of state.seatAllocations) {
    if (
      alloc.departureId === departureId &&
      alloc.allocationStatus === "held" &&
      ((alloc.holdExpiresAt && Date.parse(alloc.holdExpiresAt) <= now) ||
        (alloc.bookingId && expiredBookingIds.has(alloc.bookingId)))
    ) {
      alloc.allocationStatus = "released";
    }
  }
}

export function recalculateDepartureStatusDemo(state: DemoDatabaseState, departureId: string): void {
  const dep = state.departures.find((d) => d.id === departureId);
  if (!dep || dep.status === "cancelled" || dep.status === "completed") return;

  const now = Date.now();
  const active = state.seatAllocations.filter(
    (sa) =>
      sa.departureId === departureId &&
      (sa.allocationStatus === "confirmed" ||
        sa.allocationStatus === "operator_blocked" ||
        (sa.allocationStatus === "held" &&
          (!sa.holdExpiresAt || Date.parse(sa.holdExpiresAt) > now)))
  ).length;

  const remaining = Math.max(0, dep.maxCapacity - active);
  dep.status =
    remaining === 0
      ? "sold_out"
      : remaining <= 2
        ? "last_seats"
        : remaining <= 4
          ? "filling_fast"
          : "open";
}

/** Badge computed from live seats (same rule as get_departure_availability in SQL). */
export function liveDepartureStatus(stored: DepartureStatus, remaining: number): DepartureStatus {
  if (stored === "cancelled" || stored === "completed") return stored;
  if (remaining === 0) return "sold_out";
  if (remaining <= 2) return "last_seats";
  if (remaining <= 4) return "filling_fast";
  return "open";
}

export function computePublicAvailabilityDemo(
  state: DemoDatabaseState,
  tripId?: string
): PublicDepartureAvailability[] {
  const now = Date.now();
  return state.departures
    .filter((d) => d.isPublished && (!tripId || d.tripId === tripId))
    .map((d) => {
      const seatsTaken = state.seatAllocations.filter(
        (sa) =>
          sa.departureId === d.id &&
          (sa.allocationStatus === "confirmed" ||
            sa.allocationStatus === "operator_blocked" ||
            (sa.allocationStatus === "held" &&
              (!sa.holdExpiresAt || Date.parse(sa.holdExpiresAt) > now)))
      ).length;
      return {
        departureId: d.id,
        tripId: d.tripId,
        departureCode: d.departureCode,
        startDate: d.startDate,
        endDate: d.endDate,
        maxCapacity: d.maxCapacity,
        minOccupancy: d.minOccupancy,
        departureType: d.departureType,
        status: liveDepartureStatus(d.status, Math.max(0, d.maxCapacity - seatsTaken)),
        bookingCutoffAt: d.bookingCutoffAt,
        preferenceDeadlineAt: d.preferenceDeadlineAt,
        priceOverridePaise: d.priceOverridePaise,
        seatsTaken,
        seatsRemaining: Math.max(0, d.maxCapacity - seatsTaken),
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function getDemoTripsWithDetails(): TripWithDetails[] {
  const state = getDemoState();
  const availability = computePublicAvailabilityDemo(state);
  return state.trips
    .filter((t) => t.isPublished)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((trip) => ({
      trip,
      itinerary: state.itineraryDays
        .filter((i) => i.tripId === trip.id)
        .sort((a, b) => a.dayNumber - b.dayNumber),
      pickupPoints: state.pickupPoints
        .filter((p) => p.tripId === trip.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      departures: availability.filter((d) => d.tripId === trip.id),
    }));
}

export interface ReserveSeatsDemoInput {
  departureId: string;
  userId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  bookingMode: "batch_seats" | "private_vehicle";
  seatsRequested: number;
  pickupPointId: string | null;
  payDepositOnly: boolean;
  paymentProvider: string;
  travelers: {
    fullName: string;
    ageGroup: "adult" | "senior";
    emergencyContact: string;
    dietaryNotes?: string;
    seatRowRequest: "no_preference" | "front_middle" | "rear_window";
    roomPreference:
      | "shared_same_gender"
      | "private_room_request"
      | "couple_friends_room_request";
  }[];
  coTravelerPreference: CoTravelerPreference;
  preferenceNotes: string;
  whatsappOptIn: boolean;
  /** Exact seats picked on the car map (same rules as the SQL p_preferred_seats). */
  preferredSeats?: number[] | null;
  /** Coupon code typed at checkout (live database only). */
  couponCode?: string | null;
}

export function reserveSeatsDemo(
  input: ReserveSeatsDemoInput,
  stateOverride?: DemoDatabaseState
): { booking: BookingRecord; assignedSeats: number[] } {
  const state = stateOverride ?? getDemoState();
  const dep = state.departures.find((d) => d.id === input.departureId);
  if (!dep || !dep.isPublished) {
    throw new Error("Departure not found or unpublished.");
  }
  if (dep.status === "cancelled" || dep.status === "completed") {
    throw new Error("Departure is closed for bookings.");
  }
  if (Date.parse(dep.bookingCutoffAt) < Date.now()) {
    throw new Error("Booking cutoff has passed for this departure.");
  }

  const trip = state.trips.find((t) => t.id === dep.tripId);
  if (!trip) {
    throw new Error("Trip not found.");
  }

  if (input.pickupPointId) {
    const validPickup = state.pickupPoints.some(
      (p) => p.id === input.pickupPointId && p.tripId === trip.id
    );
    if (!validPickup) {
      throw new Error("Selected pickup hub does not belong to this trip.");
    }
  }

  releaseExpiredHoldsDemo(state, dep.id);

  const activeSeatNumbers = new Set(
    state.seatAllocations
      .filter(
        (sa) =>
          sa.departureId === dep.id &&
          (sa.allocationStatus === "held" ||
            sa.allocationStatus === "confirmed" ||
            sa.allocationStatus === "operator_blocked")
      )
      .map((sa) => sa.seatNumber)
  );

  if (input.bookingMode === "private_vehicle") {
    if (input.seatsRequested !== 6) {
      throw new Error("Private vehicle bookings must reserve all 6 seats.");
    }
    if (activeSeatNumbers.size > 0) {
      throw new Error("Private vehicle option requires all 6 seats to be available.");
    }
  }

  if (activeSeatNumbers.size + input.seatsRequested > dep.maxCapacity) {
    const left = Math.max(0, dep.maxCapacity - activeSeatNumbers.size);
    throw new Error(`Insufficient seats remaining (${left} left).`);
  }

  const chosenSeats: number[] = [];
  const preferred = input.preferredSeats ?? [];
  if (preferred.length > 0 && input.bookingMode !== "private_vehicle") {
    if (preferred.length !== input.seatsRequested) {
      throw new Error(`SEAT_COUNT: Pick exactly ${input.seatsRequested} seat(s) on the car map.`);
    }
    if (new Set(preferred).size !== preferred.length) {
      throw new Error("SEAT_DUPLICATE: The same seat was picked twice.");
    }
    if (preferred.some((s) => !Number.isInteger(s) || s < 1 || s > dep.maxCapacity)) {
      throw new Error("SEAT_INVALID: That seat is not offered on this date.");
    }
    const gone = preferred.filter((s) => activeSeatNumbers.has(s)).sort((a, b) => a - b);
    if (gone.length > 0) {
      throw new Error(`SEAT_TAKEN: Seat ${gone.join(", ")} was just taken by someone else. Please pick again.`);
    }
    chosenSeats.push(...preferred.slice().sort((a, b) => a - b));
  } else {
    for (let s = 1; s <= dep.maxCapacity; s++) {
      if (!activeSeatNumbers.has(s)) {
        chosenSeats.push(s);
        if (chosenSeats.length === input.seatsRequested) break;
      }
    }
  }

  if (chosenSeats.length < input.seatsRequested) {
    throw new Error("Unable to allocate requested seats.");
  }

  const pricing = calculateBookingPricing({
    trip,
    priceOverridePaise: dep.priceOverridePaise,
    bookingMode: input.bookingMode,
    seatsRequested: input.seatsRequested,
    payDepositOnly: input.payDepositOnly,
    bookingPolicy: state.settings.bookingPolicy,
  });

  const nowIso = new Date().toISOString();
  const holdMinutes = state.settings.bookingPolicy.holdMinutes;
  const holdExpiresAt = new Date(Date.now() + holdMinutes * 60_000).toISOString();
  const bookingId = crypto.randomUUID();
  const bookingReference = `SAN-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  const booking: BookingRecord = {
    id: bookingId,
    bookingReference,
    departureId: dep.id,
    userId: input.userId,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone,
    bookingMode: input.bookingMode,
    seatsRequested: pricing.seatsCount,
    status: "pending_payment",
    currency: "INR",
    unitPricePaise: pricing.unitPricePaise,
    subtotalPaise: pricing.subtotalPaise,
    discountPaise: pricing.discountPaise,
    taxPaise: pricing.taxPaise,
    totalPaise: pricing.totalPaise,
    amountPaidPaise: 0,
    amountDuePaise: pricing.payNowPaise,
    balanceDueAt:
      pricing.balanceLaterPaise > 0
        ? new Date(
            Date.parse(dep.startDate) -
              state.settings.bookingPolicy.balanceDueDaysBefore * 86_400_000
          ).toISOString()
        : null,
    holdExpiresAt,
    termsSnapshot: {
      policyVersion: state.settings.bookingPolicy.policyVersion,
      cancellationSlabs: state.settings.bookingPolicy.cancellationSlabs,
      roomPolicySummary: state.settings.bookingPolicy.roomPolicySummary,
    },
    pricingSnapshot: { ...pricing },
    pickupPointId: input.pickupPointId,
    verificationStatus: "not_checked",
    paymentProvider: input.paymentProvider,
    rescheduleRequestedNote: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  state.bookings.push(booking);

  for (const t of input.travelers) {
    state.travelers.push({
      id: crypto.randomUUID(),
      bookingId,
      fullName: t.fullName,
      ageGroup: t.ageGroup,
      emergencyContact: t.emergencyContact,
      dietaryNotes: t.dietaryNotes || "",
      seatRowRequest: t.seatRowRequest,
      roomPreference: t.roomPreference,
      verificationChecked: false,
    });
  }

  state.comfortPreferences.push({
    bookingId,
    coTravelerPreference: input.coTravelerPreference,
    preferenceNotes: input.preferenceNotes || null,
    resolutionStatus:
      input.coTravelerPreference === "open_mixed" ? "none_requested" : "pending_review",
    resolvedBy: null,
    resolvedAt: null,
    consentRecordedAt: nowIso,
  });

  for (const seatNumber of chosenSeats) {
    state.seatAllocations.push({
      id: crypto.randomUUID(),
      departureId: dep.id,
      bookingId,
      seatNumber,
      allocationStatus: "held",
      holdExpiresAt,
      reason: null,
    });
  }

  recalculateDepartureStatusDemo(state, dep.id);
  return { booking, assignedSeats: chosenSeats };
}

export function confirmPaymentDemo(
  params: {
    bookingId: string;
    provider: string;
    providerOrderId: string;
    providerPaymentId: string;
    idempotencyKey: string;
    amountPaise: number;
  },
  stateOverride?: DemoDatabaseState
): { bookingStatus: BookingRecord["status"]; alreadyProcessed: boolean } {
  const state = stateOverride ?? getDemoState();
  const booking = state.bookings.find((b) => b.id === params.bookingId);
  if (!booking) {
    throw new Error("Booking not found.");
  }

  const existingPayment = state.payments.find(
    (p) =>
      (p.provider === params.provider && p.providerPaymentId === params.providerPaymentId) ||
      (p.idempotencyKey === params.idempotencyKey && p.status === "captured")
  );
  if (existingPayment) {
    return { bookingStatus: booking.status, alreadyProcessed: true };
  }

  if (
    booking.status === "cancelled" ||
    booking.status === "refunded" ||
    booking.status === "expired"
  ) {
    throw new Error(`Cannot confirm payment for ${booking.status} booking.`);
  }
  if (
    booking.status === "pending_payment" &&
    booking.holdExpiresAt &&
    Date.parse(booking.holdExpiresAt) <= Date.now()
  ) {
    throw new Error("Booking hold has expired.");
  }

  const nowIso = new Date().toISOString();
  state.payments.push({
    id: crypto.randomUUID(),
    bookingId: booking.id,
    provider: params.provider,
    providerOrderId: params.providerOrderId,
    providerPaymentId: params.providerPaymentId,
    idempotencyKey: params.idempotencyKey,
    amountPaise: params.amountPaise,
    paymentType:
      booking.amountPaidPaise > 0
        ? "balance"
        : params.amountPaise < booking.totalPaise
          ? "deposit"
          : "full",
    status: "captured",
    utr: null,
    paidToUpiId: null,
    paidToName: null,
    submittedAt: null,
    lateAfterHold: false,
    seatsLost: false,
    reviewedAt: nowIso,
    reviewNote: null,
    createdAt: nowIso,
  });

  booking.amountPaidPaise = Math.min(booking.totalPaise, booking.amountPaidPaise + params.amountPaise);
  booking.amountDuePaise = Math.max(0, booking.totalPaise - booking.amountPaidPaise);
  booking.status = booking.amountDuePaise === 0 ? "confirmed" : "deposit_paid";
  booking.holdExpiresAt = null;
  booking.updatedAt = new Date().toISOString();

  for (const alloc of state.seatAllocations) {
    if (alloc.bookingId === booking.id && alloc.allocationStatus === "held") {
      alloc.allocationStatus = "confirmed";
      alloc.holdExpiresAt = null;
    }
  }

  recalculateDepartureStatusDemo(state, booking.departureId);

  state.auditLogs.unshift({
    id: crypto.randomUUID(),
    actorUserId: null,
    actorRole: "system",
    action: "payment_verified",
    entityType: "booking",
    entityId: booking.id,
    reason: `Server-verified ${params.provider} payment captured`,
    beforeState: null,
    afterState: {
      providerPaymentId: params.providerPaymentId,
      amountPaise: params.amountPaise,
      status: booking.status,
    },
    createdAt: new Date().toISOString(),
  });

  return { bookingStatus: booking.status, alreadyProcessed: false };
}

export function lookupCustomerBookingDemo(
  bookingReference: string,
  email: string
): CustomerBookingView | null {
  const state = getDemoState();
  const normalizedRef = bookingReference.trim().toUpperCase();
  const normalizedEmail = email.trim().toLowerCase();

  const booking = state.bookings.find(
    (b) =>
      b.bookingReference.toUpperCase() === normalizedRef &&
      b.customerEmail.toLowerCase() === normalizedEmail
  );
  if (!booking) return null;

  const availability = computePublicAvailabilityDemo(state).find(
    (d) => d.departureId === booking.departureId
  );
  if (!availability) return null;

  const trip = state.trips.find((t) => t.id === availability.tripId);
  if (!trip) return null;

  const pickupPoint = state.pickupPoints.find((p) => p.id === booking.pickupPointId) ?? null;
  const travelers = state.travelers.filter((t) => t.bookingId === booking.id);
  const comfort = state.comfortPreferences.find((c) => c.bookingId === booking.id);

  return {
    booking,
    trip: {
      id: trip.id,
      slug: trip.slug,
      title: trip.title,
      destination: trip.destination,
      pickupCity: trip.pickupCity,
      isSampleDemo: trip.isSampleDemo,
    },
    departure: availability,
    pickupPoint,
    travelers,
    comfortSummaryLabel: getSafeComfortCustomerLabel(
      comfort?.coTravelerPreference ?? "open_mixed",
      comfort?.resolutionStatus ?? "none_requested"
    ),
    comfortResolutionStatus: comfort?.resolutionStatus ?? "none_requested",
    assignedSeatCount: booking.seatsRequested,
  };
}

export function getAdminRowsDemo(): {
  bookings: AdminBookingRow[];
  departures: (PublicDepartureAvailability & { tripTitle: string })[];
  waitlist: (WaitlistEntry & { departureCode: string })[];
  auditLogs: AuditLogEntry[];
  trips: Trip[];
  reviews: VerifiedReview[];
} {
  const state = getDemoState();
  const avail = computePublicAvailabilityDemo(state);
  const depMap = new Map(avail.map((d) => [d.departureId, d]));
  const tripMap = new Map(state.trips.map((t) => [t.id, t]));
  const pickupMap = new Map(state.pickupPoints.map((p) => [p.id, p]));

  const bookings: AdminBookingRow[] = state.bookings
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((booking) => {
      const dep = depMap.get(booking.departureId);
      const trip = dep ? tripMap.get(dep.tripId) : undefined;
      return {
        booking,
        tripTitle: trip?.title ?? "Unknown trip",
        departureCode: dep?.departureCode ?? "—",
        departureStartDate: dep?.startDate ?? "—",
        pickupName: booking.pickupPointId ? pickupMap.get(booking.pickupPointId)?.name ?? null : null,
        travelers: state.travelers.filter((t) => t.bookingId === booking.id),
        comfortPreference: state.comfortPreferences.find((c) => c.bookingId === booking.id) ?? null,
        seatNumbers: state.seatAllocations
          .filter((s) => s.bookingId === booking.id && (s.allocationStatus === "held" || s.allocationStatus === "confirmed"))
          .map((s) => s.seatNumber)
          .sort((a, b) => a - b),
      };
    });

  return {
    bookings,
    departures: avail.map((d) => ({
      ...d,
      tripTitle: tripMap.get(d.tripId)?.title ?? "Unknown trip",
    })),
    waitlist: state.waitlist.map((w) => ({
      ...w,
      departureCode: depMap.get(w.departureId)?.departureCode ?? "—",
    })),
    auditLogs: state.auditLogs,
    trips: state.trips,
    reviews: state.reviews,
  };
}

export function adminSeatOverrideDemo(params: {
  departureId: string;
  action: "block_seat" | "release_block" | "promote_waitlist";
  seatsDelta: number;
  reason: string;
  actorUserId: string;
  actorRole: string;
}): void {
  const state = getDemoState();
  const dep = state.departures.find((d) => d.id === params.departureId);
  if (!dep) throw new Error("Departure not found.");

  if (params.action === "block_seat") {
    const active = new Set(
      state.seatAllocations
        .filter(
          (sa) =>
            sa.departureId === dep.id &&
            ["held", "confirmed", "operator_blocked"].includes(sa.allocationStatus)
        )
        .map((sa) => sa.seatNumber)
    );
    let added = 0;
    for (let s = 1; s <= dep.maxCapacity && added < params.seatsDelta; s++) {
      if (!active.has(s)) {
        state.seatAllocations.push({
          id: crypto.randomUUID(),
          departureId: dep.id,
          bookingId: null,
          seatNumber: s,
          allocationStatus: "operator_blocked",
          holdExpiresAt: null,
          reason: params.reason,
        });
        added++;
      }
    }
    if (added === 0) throw new Error("No free seats available to block.");
  } else if (params.action === "release_block") {
    let released = 0;
    for (const sa of state.seatAllocations) {
      if (
        sa.departureId === dep.id &&
        sa.allocationStatus === "operator_blocked" &&
        released < params.seatsDelta
      ) {
        sa.allocationStatus = "released";
        released++;
      }
    }
    if (released === 0) throw new Error("No operator-blocked seats to release.");
  }

  recalculateDepartureStatusDemo(state, dep.id);
  state.auditLogs.unshift({
    id: crypto.randomUUID(),
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    action: `seat_override_${params.action}`,
    entityType: "departure",
    entityId: dep.id,
    reason: params.reason,
    beforeState: null,
    afterState: { seatsDelta: params.seatsDelta },
    createdAt: new Date().toISOString(),
  });
}

export function adminBookingActionDemo(params: {
  bookingId: string;
  action: "mark_verified" | "cancel_booking" | "mark_refunded" | "resolve_comfort";
  comfortResolution?: ComfortResolutionStatus;
  reason: string;
  actorUserId: string;
  actorRole: string;
}): void {
  const state = getDemoState();
  const booking = state.bookings.find((b) => b.id === params.bookingId);
  if (!booking) throw new Error("Booking not found.");

  const prevStatus = booking.status;

  if (params.action === "mark_verified") {
    booking.verificationStatus = "checked";
    for (const t of state.travelers) {
      if (t.bookingId === booking.id) t.verificationChecked = true;
    }
  } else if (params.action === "cancel_booking" || params.action === "mark_refunded") {
    booking.status = params.action === "mark_refunded" ? "refunded" : "cancelled";
    for (const sa of state.seatAllocations) {
      if (sa.bookingId === booking.id) {
        sa.allocationStatus = "released";
      }
    }
  } else if (params.action === "resolve_comfort" && params.comfortResolution) {
    const comfort = state.comfortPreferences.find((c) => c.bookingId === booking.id);
    if (comfort) {
      comfort.resolutionStatus = params.comfortResolution;
      comfort.resolvedBy = params.actorUserId;
      comfort.resolvedAt = new Date().toISOString();
    }
  }

  booking.updatedAt = new Date().toISOString();
  recalculateDepartureStatusDemo(state, booking.departureId);

  state.auditLogs.unshift({
    id: crypto.randomUUID(),
    actorUserId: params.actorUserId,
    actorRole: params.actorRole,
    action: params.action,
    entityType: "booking",
    entityId: booking.id,
    reason: params.reason,
    beforeState: { status: prevStatus },
    afterState: { status: booking.status, comfortResolution: params.comfortResolution ?? null },
    createdAt: new Date().toISOString(),
  });
}

