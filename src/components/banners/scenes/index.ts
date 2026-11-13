import type { SceneFactory } from "../engine";

export type BannerSceneName = "trips" | "safety" | "policies" | "contact" | "booking";

/** Each scene is its own chunk, so a page downloads only the one it shows. */
export const SCENE_LOADERS: Record<BannerSceneName, () => Promise<SceneFactory>> = {
  trips: () => import("./trips").then((m) => m.createTripsScene),
  safety: () => import("./safety").then((m) => m.createSafetyScene),
  policies: () => import("./policies").then((m) => m.createPoliciesScene),
  contact: () => import("./contact").then((m) => m.createContactScene),
  booking: () => import("./booking").then((m) => m.createBookingScene),
};
