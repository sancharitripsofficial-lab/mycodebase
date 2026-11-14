import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import {
  StaffError,
  addStaff,
  changeStaffRole,
  listStaff,
  removeStaff,
  resetStaffPassword,
  staffDatabaseReady,
} from "@/lib/data/staff";
import { checkRateLimit } from "@/lib/rate-limit";

/** Admin → Settings → Staff & access. Owner only, every action audit-logged, no passwords logged. */
export const dynamic = "force-dynamic";

const role = z.enum(["owner", "ops", "support"]);
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    email: z.string().trim().max(160),
    role,
    password: z.string().max(72).default(""),
    notes: z.string().max(200).optional(),
  }),
  z.object({ action: z.literal("role"), userId: z.string().uuid(), role }),
  z.object({ action: z.literal("remove"), userId: z.string().uuid() }),
  z.object({ action: z.literal("reset_password"), userId: z.string().uuid(), password: z.string().max(72) }),
]);

const noStore = { "cache-control": "no-store" };

async function ownerOnly() {
  try {
    return await requireStaff(["owner"]);
  } catch {
    return null;
  }
}

export async function GET() {
  const actor = await ownerOnly();
  if (!actor) return NextResponse.json({ error: "Only the owner can manage staff access." }, { status: 403, headers: noStore });
  if (!staffDatabaseReady()) return NextResponse.json({ ready: false, staff: [] }, { headers: noStore });
  try {
    return NextResponse.json({ ready: true, staff: await listStaff(), you: actor.userId }, { headers: noStore });
  } catch (err) {
    const status = err instanceof StaffError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not load staff." }, { status, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const actor = await ownerOnly();
  if (!actor) return NextResponse.json({ error: "Only the owner can manage staff access." }, { status: 403, headers: noStore });
  if (!staffDatabaseReady()) return NextResponse.json({ error: "Staff access needs the database connected." }, { status: 409, headers: noStore });
  if (!checkRateLimit(`staff:${actor.userId}`, 30, 10 * 60_000).allowed) {
    return NextResponse.json({ error: "Too many changes in a short time. Please wait a few minutes." }, { status: 429, headers: noStore });
  }

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the form." }, { status: 400, headers: noStore });
  const who = { userId: actor.userId, staffRole: actor.staffRole };
  const body = parsed.data;
  try {
    switch (body.action) {
      case "add": {
        const { member, createdLogin } = await addStaff(body, who);
        return NextResponse.json(
          {
            ok: true,
            member,
            message: createdLogin
              ? `${member.email} can now sign in at /admin with the password you set. Share it with them privately.`
              : `${member.email} already had a login, so they sign in with their own password. Access added.`,
          },
          { headers: noStore },
        );
      }
      case "role":
        await changeStaffRole(body.userId, body.role, who);
        return NextResponse.json({ ok: true, message: "Role changed. It applies on their next click." }, { headers: noStore });
      case "remove":
        await removeStaff(body.userId, who);
        return NextResponse.json({ ok: true, message: "Access removed. They are locked out of the admin from their next click." }, { headers: noStore });
      case "reset_password":
        await resetStaffPassword(body.userId, body.password, who);
        return NextResponse.json({ ok: true, message: "New password set. Share it with them privately." }, { headers: noStore });
    }
  } catch (err) {
    const status = err instanceof StaffError ? err.status : 500;
    if (!(err instanceof StaffError)) console.error("[staff] action failed");
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save." }, { status, headers: noStore });
  }
}
