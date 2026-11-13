"use client";

import { useId, useState } from "react";
import styles from "./ErtigaSeatMap.module.css";

export interface ErtigaSeatMapProps {
  /** Seats already held/booked by others (1..6). */
  takenSeats: number[];
  /** Seats this customer picked. */
  selectedSeats: number[];
  /** Default 6. Seat numbers above this render as "not offered". */
  maxCapacity?: number;
  /** pick = seats are tappable buttons; view = static picture. */
  mode: "pick" | "view";
  /** Whole-car booking: all offered seats show as the customer's. */
  privateCar?: boolean;
  onToggleSeat?: (seat: number) => void;
  /** Seat data loading: soft shimmer, nothing tappable. */
  loading?: boolean;
  /** Default true. */
  showLegend?: boolean;
  className?: string;
}

export const SEAT_INFO: Record<
  number,
  { row: "front" | "middle" | "back"; label: string; position: string }
> = {
  1: { row: "front", label: "Front passenger", position: "Front left, window" },
  2: { row: "middle", label: "Middle row, left", position: "Middle row left, window" },
  3: { row: "middle", label: "Middle row, centre", position: "Middle row, middle seat" },
  4: { row: "middle", label: "Middle row, right", position: "Middle row right, window" },
  5: { row: "back", label: "Back row, left", position: "Back row left, window" },
  6: { row: "back", label: "Back row, right", position: "Back row right, window" },
};

type SeatState = "available" | "yours" | "taken" | "off" | "loading";

/** Drawing space of the whole map. */
const VB_W = 320;
const VB_H = 580;
/** Drawing space of one seat. */
const SEAT_W = 60;
const SEAT_H = 78;

/** Right-hand drive: seat 1 is front LEFT, the driver sits front RIGHT. */
const SEATS: ReadonlyArray<{
  seat: number;
  x: number;
  y: number;
  hint: string;
  spoken: string;
}> = [
  { seat: 1, x: 90, y: 180, hint: "Window", spoken: "front, left window" },
  { seat: 2, x: 90, y: 278, hint: "Window", spoken: "middle row, left window" },
  { seat: 3, x: 158, y: 278, hint: "Middle", spoken: "middle row, middle seat" },
  { seat: 4, x: 226, y: 278, hint: "Window", spoken: "middle row, right window" },
  { seat: 5, x: 100, y: 376, hint: "Window", spoken: "back row, left window" },
  { seat: 6, x: 216, y: 376, hint: "Window", spoken: "back row, right window" },
];

const DRIVER = { x: 226, y: 180 };

const STATE_SPOKEN: Record<SeatState, string> = {
  available: "available",
  yours: "your seat",
  taken: "taken",
  off: "not offered on this trip",
  loading: "checking availability",
};

function pct(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(3)}%`;
}

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** One car seat seen from above: cushion in front, backrest and headrest behind. */
function SeatGlyph({
  seat,
  state,
  compact = false,
}: {
  seat: number;
  state: SeatState;
  compact?: boolean;
}) {
  return (
    <svg viewBox={`0 0 ${SEAT_W} ${SEAT_H}`} aria-hidden="true" focusable="false">
      <rect className={styles.cushion} x="3" y="1.5" width="54" height="55" rx="13" />
      <path className={styles.seam} d="M13.5 10v34M46.5 10v34" />
      <rect className={styles.back} x="1.5" y="46" width="57" height="30.5" rx="11" />
      <rect className={styles.head} x="16" y="57.5" width="28" height="17.5" rx="6.5" />
      {state !== "loading" && state !== "off" ? (
        <ellipse cx="30" cy="9" rx="17" ry="3.2" fill="#FFFEFC" fillOpacity="0.28" />
      ) : null}

      {state === "available" || state === "off" ? (
        compact ? null : (
          <text className={styles.num} x="30" y="33.5" textAnchor="middle">
            {seat}
          </text>
        )
      ) : null}

      {state === "yours" ? (
        <>
          <circle cx="30" cy="26" r="11.5" fill="#FFFEFC" />
          <path
            d="M24.2 26.4l4 4 7.6-8.4"
            fill="none"
            stroke="#E8600F"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}

      {state === "taken" ? (
        <>
          <path
            d="M25 25v-4a5 5 0 0 1 10 0v4"
            fill="none"
            stroke="#FFFEFC"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <rect x="21.5" y="24.5" width="17" height="13" rx="3" fill="#FFFEFC" />
          <circle cx="30" cy="31" r="1.9" fill="#4B6273" />
        </>
      ) : null}

      {!compact && (state === "yours" || state === "taken") ? (
        <text className={styles.numSmall} x="30" y="70" textAnchor="middle">
          {seat}
        </text>
      ) : null}

      {!compact && state === "yours" ? (
        <>
          <rect
            x="33"
            y="-3"
            width="28"
            height="13"
            rx="6.5"
            fill="#FFFEFC"
            stroke="#E8600F"
            strokeWidth="1.5"
          />
          <text className={styles.youText} x="47" y="6.6" textAnchor="middle">
            You
          </text>
        </>
      ) : null}
    </svg>
  );
}

/** The car itself: pure artwork, hidden from assistive tech. */
function CarArtwork({ uid, cap }: { uid: string; cap: number }) {
  const body = `${uid}-body`;
  const glass = `${uid}-glass`;
  const floor = `${uid}-floor`;
  const lamp = `${uid}-lamp`;
  return (
    <svg
      className={styles.car}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#DCE8EE" />
          <stop offset="0.16" stopColor="#FFFEFC" />
          <stop offset="0.5" stopColor="#FFFEFC" />
          <stop offset="0.84" stopColor="#FFFEFC" />
          <stop offset="1" stopColor="#DCE8EE" />
        </linearGradient>
        <linearGradient id={glass} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#DDF3F4" />
          <stop offset="0.45" stopColor="#1BA3B3" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#DDF3F4" stopOpacity="0.9" />
          <stop offset="1" stopColor="#0C7A8C" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id={floor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#DCE8EE" />
          <stop offset="1" stopColor="#F2F8FA" />
        </linearGradient>
        <radialGradient id={lamp} cx="0.5" cy="0.5" r="0.6">
          <stop offset="0" stopColor="#FFFEFC" />
          <stop offset="1" stopColor="#F5A524" stopOpacity="0.75" />
        </radialGradient>
      </defs>

      {/* wheels peeking out at the sides */}
      <g fill="#4B6273">
        <rect x="67" y="78" width="16" height="54" rx="6" />
        <rect x="293" y="78" width="16" height="54" rx="6" />
        <rect x="67" y="424" width="16" height="54" rx="6" />
        <rect x="293" y="424" width="16" height="54" rx="6" />
      </g>
      <g stroke="#DCE8EE" strokeOpacity="0.5" strokeWidth="1.2">
        <path d="M69 90h4M69 100h4M69 110h4M69 120h4M303 90h4M303 100h4M303 110h4M303 120h4" />
        <path d="M69 436h4M69 446h4M69 456h4M69 466h4M303 436h4M303 446h4M303 456h4M303 466h4" />
      </g>

      {/* side mirrors */}
      <g fill="#FFFEFC" stroke="#4B6273" strokeOpacity="0.45" strokeWidth="1.3">
        <path d="M82 150l-17 -4a5 5 0 0 0 -6 5v3a5 5 0 0 0 5 5l18 1z" />
        <path d="M294 150l17 -4a5 5 0 0 1 6 5v3a5 5 0 0 1 -5 5l-18 1z" />
      </g>
      <path d="M62 151v5M314 151v5" stroke="#1BA3B3" strokeWidth="2" strokeLinecap="round" />

      {/* body shell */}
      <path
        d="M188 14c48 0 90 5 100 34l8 60 4 36v358c0 38 -12 60 -40 64H116c-28 -4 -40 -26 -40 -64V144l4 -36 8 -60c10 -29 52 -34 100 -34z"
        fill={`url(#${body})`}
        stroke="#4B6273"
        strokeOpacity="0.45"
        strokeWidth="1.6"
      />

      {/* bonnet creases + grille */}
      <path
        d="M124 34c-6 22 -9 48 -10 76M252 34c6 22 9 48 10 76"
        fill="none"
        stroke="#DCE8EE"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="152" y="17.5" width="72" height="6" rx="3" fill="#4B6273" fillOpacity="0.4" />

      {/* headlights */}
      <g stroke="#F5A524" strokeWidth="1.3">
        <ellipse cx="108" cy="29" rx="17" ry="6.5" transform="rotate(-20 108 29)" fill={`url(#${lamp})`} />
        <ellipse cx="268" cy="29" rx="17" ry="6.5" transform="rotate(20 268 29)" fill={`url(#${lamp})`} />
      </g>

      {/* windscreen */}
      <path
        d="M94 124q94 -20 188 0l-9 30q-85 -11 -170 0z"
        fill={`url(#${glass})`}
        stroke="#0C7A8C"
        strokeOpacity="0.5"
        strokeWidth="1.3"
      />
      <path d="M110 128q40 -8 70 -9l-8 26q-30 1 -54 4z" fill="#FFFEFC" fillOpacity="0.35" />

      {/* cabin floor */}
      <path
        d="M103 154q85 -11 170 0l13 12v330q0 24 -22 28H112q-22 -4 -22 -28V166z"
        fill={`url(#${floor})`}
        stroke="#4B6273"
        strokeOpacity="0.25"
        strokeWidth="1.2"
      />

      {/* dashboard */}
      <path d="M104 155q84 -10 168 0l10 9v8H94v-8z" fill="#4B6273" fillOpacity="0.5" />
      <rect x="112" y="164" width="34" height="4" rx="2" fill="#FFFEFC" fillOpacity="0.5" />
      <rect x="170" y="162" width="36" height="7" rx="2.5" fill="#DDF3F4" fillOpacity="0.8" />

      {/* roof rails hint */}
      <path
        d="M83.5 196v292M292.5 196v292"
        stroke="#4B6273"
        strokeOpacity="0.4"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <g fill="#4B6273" fillOpacity="0.55">
        <rect x="81.5" y="204" width="4" height="9" rx="2" />
        <rect x="81.5" y="470" width="4" height="9" rx="2" />
        <rect x="290.5" y="204" width="4" height="9" rx="2" />
        <rect x="290.5" y="470" width="4" height="9" rx="2" />
      </g>

      {/* door seams + handles */}
      <path
        d="M76.5 172h13M76.5 268h13M76.5 366h13M286.5 172h13M286.5 268h13M286.5 366h13"
        stroke="#4B6273"
        strokeOpacity="0.45"
        strokeWidth="1.2"
      />
      <path
        d="M79.5 240v14M79.5 338v14M296.5 240v14M296.5 338v14"
        stroke="#0E5E8F"
        strokeOpacity="0.5"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* driver seat (not bookable) */}
      <g transform={`translate(${DRIVER.x} ${DRIVER.y})`}>
        <rect x="3" y="1.5" width="54" height="55" rx="13" fill="#DCE8EE" stroke="#4B6273" strokeOpacity="0.4" strokeWidth="1.4" />
        <rect x="1.5" y="46" width="57" height="30.5" rx="11" fill="#DCE8EE" stroke="#4B6273" strokeOpacity="0.4" strokeWidth="1.4" />
        <rect x="16" y="57.5" width="28" height="17.5" rx="6.5" fill="#F2F8FA" stroke="#4B6273" strokeOpacity="0.4" strokeWidth="1.4" />
        <text className={styles.hint} x="30" y="38" textAnchor="middle">
          Driver
        </text>
      </g>

      {/* steering wheel on the right (India is right-hand drive) */}
      <g transform="translate(256 179)">
        <path d="M0 -6v-9" stroke="#4B6273" strokeWidth="4" strokeLinecap="round" />
        <circle r="13.5" fill="#FFFEFC" fillOpacity="0.55" stroke="#0B5683" strokeWidth="3.6" />
        <path d="M-12.5 -1h25M0 2v11" stroke="#0B5683" strokeWidth="2.6" strokeLinecap="round" />
        <circle r="4.2" fill="#0B5683" />
        <circle r="1.6" fill="#DDF3F4" />
      </g>

      {/* hints under seats */}
      {SEATS.map((s) => (
        <text
          key={s.seat}
          className={styles.hint}
          x={s.x + SEAT_W / 2}
          y={s.y + SEAT_H + 10.5}
          textAnchor="middle"
          fillOpacity={s.seat > cap ? 0.5 : 1}
        >
          {s.hint}
        </text>
      ))}

      {/* boot */}
      <rect
        x="100"
        y="474"
        width="176"
        height="42"
        rx="12"
        fill="#DDF3F4"
        fillOpacity="0.7"
        stroke="#1BA3B3"
        strokeOpacity="0.7"
        strokeWidth="1.3"
        strokeDasharray="5 4"
      />
      <g transform="translate(131 483)" fill="none" stroke="#0C7A8C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.5 5V2.2a1.2 1.2 0 0 1 1.2 -1.2h4.6a1.2 1.2 0 0 1 1.2 1.2V5" />
        <rect x="1.5" y="5" width="15" height="16" rx="3" fill="#FFFEFC" />
        <path d="M6.5 9v8M11.5 9v8M5 23.5v-2M13 23.5v-2" />
      </g>
      <text className={styles.bootText} x="158" y="499.5">
        1 bag each
      </text>

      {/* rear glass */}
      <path
        d="M106 528q82 9 164 0l7 17q-89 12 -178 0z"
        fill={`url(#${glass})`}
        stroke="#0C7A8C"
        strokeOpacity="0.5"
        strokeWidth="1.3"
      />

      {/* tail-lights */}
      <g stroke="#FF8A3D" strokeWidth="1.2">
        <path d="M84 536q2 18 20 25l12 2q-14 -8 -20 -24z" fill="#E8600F" />
        <path d="M292 536q-2 18 -20 25l-12 2q14 -8 20 -24z" fill="#E8600F" />
      </g>
      <rect x="160" y="558.5" width="56" height="5" rx="2.5" fill="#4B6273" fillOpacity="0.35" />

      {/* row captions beside the car */}
      <g>
        <text className={styles.caption} x="6" y="222">
          Front
        </text>
        <text className={styles.caption} x="6" y="314">
          <tspan x="6">Middle</tspan>
          <tspan x="6" dy="12">
            row
          </tspan>
        </text>
        <text className={styles.caption} x="6" y="412">
          <tspan x="6">Back</tspan>
          <tspan x="6" dy="12">
            row
          </tspan>
        </text>
        <path
          d="M46 218.5h14M54 316.5h8M46 414.5h14"
          stroke="#4B6273"
          strokeOpacity="0.4"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeDasharray="2 3"
        />
      </g>
    </svg>
  );
}

export function ErtigaSeatMap({
  takenSeats,
  selectedSeats,
  maxCapacity = 6,
  mode,
  privateCar = false,
  onToggleSeat,
  loading = false,
  showLegend = true,
  className,
}: ErtigaSeatMapProps) {
  const uid = `esm${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [popSeat, setPopSeat] = useState<number | null>(null);

  const cap = Math.max(0, Math.min(6, Math.floor(maxCapacity)));
  const pick = mode === "pick";

  const stateOf = (seat: number): SeatState => {
    if (seat > cap) return "off";
    if (loading) return "loading";
    if (privateCar) return "yours";
    if (takenSeats.includes(seat)) return "taken";
    if (selectedSeats.includes(seat)) return "yours";
    return "available";
  };

  const states = SEATS.map((s) => stateOf(s.seat));
  const takenCount = states.filter((s) => s === "taken").length;
  const yoursCount = states.filter((s) => s === "yours").length;
  const freeCount = states.filter((s) => s === "available").length;

  let statusMain: string;
  let statusYou = "";
  if (loading) {
    statusMain = "Checking seats…";
  } else if (privateCar) {
    statusMain = "Private car";
    statusYou = `all ${cap} seats are yours`;
  } else {
    statusMain = `${takenCount} of ${cap} seats taken`;
    statusYou = mode === "view" && yoursCount === 0 ? "" : mode === "view" ? `yours: ${yoursCount}` : `you picked ${yoursCount}`;
  }
  const summary = loading
    ? "Car seat map. Checking which seats are free."
    : privateCar
      ? `Car seat map. Private car: all ${cap} seats are yours.`
      : `Car seat map. ${takenCount} of ${cap} seats taken, ${yoursCount} picked by you, ${freeCount} available.`;

  const handle = (seat: number, state: SeatState) => {
    if (state === "available") setPopSeat(seat);
    else if (popSeat === seat) setPopSeat(null);
    onToggleSeat?.(seat);
  };

  return (
    <div className={cx(styles.root, className)}>
      <div
        className={styles.stage}
        role={pick ? "group" : "img"}
        aria-label={pick ? "Choose your seats. The car is shown from above, front at the top." : summary}
        aria-busy={loading || undefined}
      >
        <CarArtwork uid={uid} cap={cap} />

        {SEATS.map((s, i) => {
          const state = states[i];
          const pos = {
            left: pct(s.x, VB_W),
            top: pct(s.y, VB_H),
            width: pct(SEAT_W, VB_W),
            height: pct(SEAT_H, VB_H),
          };
          if (!pick) {
            return (
              <div key={s.seat} className={styles.seat} style={pos} data-state={state} aria-hidden="true">
                <SeatGlyph seat={s.seat} state={state} />
              </div>
            );
          }
          const tappable = !privateCar && (state === "available" || state === "yours");
          return (
            <button
              key={s.seat}
              type="button"
              className={cx(styles.seat, popSeat === s.seat && state === "yours" && styles.pop)}
              style={pos}
              data-state={state}
              data-private={privateCar || undefined}
              aria-pressed={state === "yours"}
              aria-label={`Seat ${s.seat}, ${s.spoken} — ${STATE_SPOKEN[state]}`}
              title={SEAT_INFO[s.seat].label}
              disabled={!tappable}
              onClick={() => handle(s.seat, state)}
            >
              <SeatGlyph seat={s.seat} state={state} />
            </button>
          );
        })}
      </div>

      {showLegend ? (
        <>
          <ul className={styles.legend} aria-label="Seat colours">
            <li>
              <span className={cx(styles.seat, styles.swatch)} data-state="available">
                <SeatGlyph seat={0} state="available" compact />
              </span>
              Available
            </li>
            <li>
              <span className={cx(styles.seat, styles.swatch)} data-state="yours">
                <SeatGlyph seat={0} state="yours" compact />
              </span>
              Your seat
            </li>
            <li>
              <span className={cx(styles.seat, styles.swatch)} data-state="taken">
                <SeatGlyph seat={0} state="taken" compact />
              </span>
              Taken
            </li>
            {cap < 6 ? (
              <li>
                <span className={cx(styles.seat, styles.swatch)} data-state="off">
                  <SeatGlyph seat={0} state="off" compact />
                </span>
                Not offered
              </li>
            ) : null}
          </ul>
          <p className={styles.status} role={pick ? "status" : undefined} aria-live={pick ? "polite" : undefined}>
            {statusMain}
            {statusYou ? (
              <>
                {" • "}
                <span>{statusYou}</span>
              </>
            ) : null}
          </p>
        </>
      ) : null}
    </div>
  );
}

export default ErtigaSeatMap;

/**
 * Preview helper only (used by /seat-map-preview): keeps the picked seats in
 * local state so the map can be clicked without a booking flow around it.
 */
export function ErtigaSeatMapPlayground({
  initialSelected = [],
  ...rest
}: Omit<ErtigaSeatMapProps, "selectedSeats" | "onToggleSeat"> & { initialSelected?: number[] }) {
  const [selected, setSelected] = useState<number[]>(initialSelected);
  return (
    <ErtigaSeatMap
      {...rest}
      selectedSeats={selected}
      onToggleSeat={(seat) =>
        setSelected((cur) => (cur.includes(seat) ? cur.filter((n) => n !== seat) : [...cur, seat].sort((a, b) => a - b)))
      }
    />
  );
}
