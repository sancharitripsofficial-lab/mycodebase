import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

// Link previews (WhatsApp, Instagram, Facebook, Google): the official Sanchari logo, not a photo.
export const alt = "Sanchari Micro Trips — weekend road trips from Bengaluru, max 6 per car";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const logo = await readFile(path.join(process.cwd(), "public", "brand", "sanchari-logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 64,
          background: "linear-gradient(135deg, #fffdf8 0%, #f1f8f4 55%, #ffeedd 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <img src={logoSrc} width={430} height={425} alt="" style={{ objectFit: "contain" }} />
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 560, gap: 18 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#e8600f", letterSpacing: 2 }}>WEEKEND TRIPS FROM BENGALURU</div>
          <div style={{ fontSize: 58, fontWeight: 800, color: "#0d5f6b", lineHeight: 1.08 }}>Leave as strangers. Return as a story.</div>
          <div style={{ fontSize: 28, color: "#3d5552", lineHeight: 1.35 }}>
            Coorg · Chikmagalur · Gokarna · Hampi — max 6 travellers per car, pick your seat, pay by UPI.
          </div>
        </div>
      </div>
    ),
    size
  );
}
