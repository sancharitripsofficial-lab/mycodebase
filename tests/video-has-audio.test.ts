/** "Tap for sound" shows only on clips that carry sound (our monsoon films are silent on purpose). */
import { describe, expect, it } from "vitest";
import { videoHasAudio } from "@/lib/use-has-audio";

const clip = (props: Record<string, unknown>) => ({ readyState: 4, currentTime: 0, ...props }) as unknown as HTMLVideoElement;

describe("videoHasAudio", () => {
  it("waits until the clip's details are loaded", () => {
    expect(videoHasAudio(clip({ readyState: 0, mozHasAudio: false }))).toBeNull();
  });

  it("uses Firefox's and Safari's direct answers", () => {
    expect(videoHasAudio(clip({ mozHasAudio: true }))).toBe(true);
    expect(videoHasAudio(clip({ mozHasAudio: false }))).toBe(false);
    expect(videoHasAudio(clip({ audioTracks: { length: 1 } }))).toBe(true);
    expect(videoHasAudio(clip({ audioTracks: { length: 0 } }))).toBe(false);
  });

  it("in Chrome decides from decoded sound once the clip has played a moment", () => {
    expect(videoHasAudio(clip({ webkitAudioDecodedByteCount: 2048, currentTime: 0.1 }))).toBe(true);
    expect(videoHasAudio(clip({ webkitAudioDecodedByteCount: 0, currentTime: 0.2 }))).toBeNull();
    expect(videoHasAudio(clip({ webkitAudioDecodedByteCount: 0, currentTime: 1.5 }))).toBe(false);
  });

  it("stays unknown in browsers that cannot tell", () => {
    expect(videoHasAudio(clip({}))).toBeNull();
  });
});
