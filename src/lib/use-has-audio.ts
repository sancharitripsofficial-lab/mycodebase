"use client";

import { useEffect, useState, type RefObject } from "react";

type AudioProbe = HTMLVideoElement & {
  mozHasAudio?: boolean;
  webkitAudioDecodedByteCount?: number;
  audioTracks?: { length: number };
};

/**
 * Whether a video carries a sound track: true / false once the browser can tell, null while unknown.
 * Firefox and Safari know as soon as the clip's details load; Chrome only after it has played a moment.
 */
export function videoHasAudio(v: HTMLVideoElement): boolean | null {
  if (v.readyState < 1) return null; // details not loaded yet
  const p = v as AudioProbe;
  if (typeof p.mozHasAudio === "boolean") return p.mozHasAudio;
  if (p.audioTracks && typeof p.audioTracks.length === "number") return p.audioTracks.length > 0;
  if (typeof p.webkitAudioDecodedByteCount === "number") {
    if (p.webkitAudioDecodedByteCount > 0) return true;
    return v.currentTime > 0.8 ? false : null;
  }
  return null;
}

/**
 * Watches a video and reports whether it has sound, so a "Tap for sound" button is shown only on
 * clips that have some (our own monsoon films are silent on purpose). `key` restarts the check when
 * the clip changes.
 */
export function useHasAudio(ref: RefObject<HTMLVideoElement | null>, key: unknown): boolean | null {
  const [state, setState] = useState<{ key: unknown; has: boolean | null }>({ key, has: null });
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const events = ["loadedmetadata", "loadeddata", "timeupdate"] as const;
    const stop = () => events.forEach((e) => v.removeEventListener(e, check));
    function check() {
      const has = videoHasAudio(v!);
      if (has === null) return;
      setState({ key, has });
      stop();
    }
    events.forEach((e) => v.addEventListener(e, check));
    check();
    return stop;
  }, [ref, key]);
  return state.key === key ? state.has : null;
}
