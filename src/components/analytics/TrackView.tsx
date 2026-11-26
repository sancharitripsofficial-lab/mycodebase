"use client";

import { useEffect, useRef } from "react";
import { trackEvent, type EventParams, type FunnelEvent } from "@/lib/analytics";

/** Sends one event when the page it sits on is opened (e.g. view_trip on a trip page). */
export function TrackView({ name, params }: { name: FunnelEvent; params: EventParams }) {
  const sent = useRef(false);
  useEffect(() => {
    // Once per visit to the page, also when React runs effects twice in development.
    if (sent.current) return;
    sent.current = true;
    trackEvent(name, params);
    // The page decides the params once, on the server: one event per visit to this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
