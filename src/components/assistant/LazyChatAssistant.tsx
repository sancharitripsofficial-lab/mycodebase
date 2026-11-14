"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { ChatAssistantConfig } from "./chat-config";

// The chat guide (its code and the 3D living picture) starts after the page has loaded and the
// phone is idle, so it never competes with the page's own first paint.
const ChatAssistant = dynamic(() => import("./ChatAssistant").then((m) => m.ChatAssistant), { ssr: false });

export function LazyChatAssistant({ config }: { config: ChatAssistantConfig }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let idle = 0;
    let timer = 0;
    const start = () => {
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      } else {
        timer = window.setTimeout(() => setReady(true), 1200); // Safari: no idle callback
      }
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      if (idle && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, []);

  return ready ? <ChatAssistant config={config} /> : null;
}
