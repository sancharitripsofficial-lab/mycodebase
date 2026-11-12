import { Check, Lock } from "lucide-react";
import styles from "./motion.module.css";

export interface SeatPulseProps {
  /** Seats already booked by other travelers. */
  taken: number;
  /** Seats the current visitor is choosing. Default 0. */
  selected?: number;
  /** Passenger seats in the car (1 to 6). Default 6. */
  max?: number;
  /** "onLight" for the cream canvas, "onDark" for the ocean-blue hero. */
  tone?: "onLight" | "onDark";
  /** Show the "2 booked · 1 yours · 3 open" text under the car. Default true. */
  showLegend?: boolean;
  className?: string;
}

type SeatState = "taken" | "selected" | "open";

/** Tiny top-down view of the car (driver + up to 6 seats) showing booked, yours and open seats; open seats pulse gently. */
export function SeatPulse({
  taken,
  selected = 0,
  max = 6,
  tone = "onLight",
  showLegend = true,
  className,
}: SeatPulseProps) {
  const cap = Math.min(6, Math.max(1, Math.round(max)));
  const takenCount = Math.min(cap, Math.max(0, Math.round(taken)));
  const selectedCount = Math.min(cap - takenCount, Math.max(0, Math.round(selected)));
  const openCount = cap - takenCount - selectedCount;

  const seats: SeatState[] = Array.from({ length: cap }, (_, i) =>
    i < takenCount ? "taken" : i < takenCount + selectedCount ? "selected" : "open",
  );
  // Ertiga-style rows, front to back: driver + 1, then 3, then 2.
  const rows: SeatState[][] = [seats.slice(0, 1), seats.slice(1, 4), seats.slice(4, 6)];

  const label =
    `Car with ${cap} passenger seats: ${takenCount} booked` +
    (selectedCount > 0 ? `, ${selectedCount} selected by you` : "") +
    `, ${openCount} open.`;

  const rootClass = [styles.seats, tone === "onDark" ? styles.seatsOnDark : styles.seatsOnLight, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div role="img" aria-label={label} className={rootClass}>
      <div className={styles.seatCar} aria-hidden="true">
        <span className={styles.seatWindshield} />
        {rows.map((row, r) => (
          <div key={r} className={styles.seatRow}>
            {row.map((state, i) => (
              <span key={i} className={styles.seat} data-state={state}>
                {state === "taken" && <Lock size={13} strokeWidth={2.4} />}
                {state === "selected" && <Check size={15} strokeWidth={3} />}
                {state === "open" && <span className={styles.seatOpenDot} />}
              </span>
            ))}
            {r === 0 && (
              // India is right-hand drive, so the driver sits front right.
              <span className={styles.seat} data-state="driver">
                <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6" />
                  <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
                  <path d="M2.4 7h3.9M9.7 7h3.9M8 9.6V14" />
                </svg>
              </span>
            )}
          </div>
        ))}
      </div>
      {showLegend && (
        <p className={styles.seatLegend} aria-hidden="true">
          <span>
            <Lock size={11} strokeWidth={2.4} /> {takenCount} booked
          </span>
          {selectedCount > 0 && (
            <span>
              <Check size={12} strokeWidth={3} /> {selectedCount} yours
            </span>
          )}
          <span>
            <span className={styles.seatLegendRing} /> {openCount} open
          </span>
        </p>
      )}
    </div>
  );
}
