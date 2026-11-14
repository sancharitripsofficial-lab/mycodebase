import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { StaffError, changeOwnPassword, staffDatabaseReady } from "@/lib/data/staff";
import { checkRateLimit } from "@/lib/rate-limit";

/** Admin → My password: any staff member changes their own password (current one checked). */
export const dynamic = "force-dynamic";

const schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().max(72) });
const noStore = { "cache-control": "no-store" };

export async function POST(request: NextRequest) {
  let actor;
  try {
    actor = await requireStaff(["owner", "ops", "support"]);
  } catch {
    return NextResponse.json({ error: "Admin sign-in required." }, { status: 403, headers: noStore });
  }
  if (actor.isDemoAdmin || !staffDatabaseReady()) {
    return NextResponse.json({ error: "Passwords can be changed once the database is connected." }, { status: 409, headers: noStore });
  }
  // Slows down anyone guessing the current password from a signed-in session.
  if (!checkRateLimit(`own-password:${actor.userId}`, 5, 15 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many tries. Please wait 15 minutes." }, { status: 429, headers: noStore });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fill in both passwords." }, { status: 400, headers: noStore });
  try {
    await changeOwnPassword({ userId: actor.userId, staffRole: actor.staffRole, email: actor.email }, parsed.data.currentPassword, parsed.data.newPassword);
    return NextResponse.json({ ok: true, message: "Password changed. Use the new one next time you sign in." }, { headers: noStore });
  } catch (err) {
    const status = err instanceof StaffError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not change the password." }, { status, headers: noStore });
  }
}
