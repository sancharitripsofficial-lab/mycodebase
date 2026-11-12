import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

const DEMO_ADMIN_COOKIE = "sanchari_demo_admin_role";

const loginSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("supabase"),
    email: z.string().email(),
    password: z.string().min(6),
  }),
  z.object({
    mode: z.literal("demo"),
    role: z.enum(["owner", "ops", "support"]),
  }),
]);

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login parameters." }, { status: 400 });
  }

  if (parsed.data.mode === "demo") {
    if (isSupabaseConfigured() || process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Demo operator login is disabled when Supabase or production mode is active." },
        { status: 403 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(DEMO_ADMIN_COOKIE, parsed.data.role, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 4,
    });
    return NextResponse.json({ ok: true, role: parsed.data.role, isDemoAdmin: true });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Supabase is not configured in .env.local yet." },
      { status: 503 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? "Invalid credentials." }, { status: 401 });
  }

  let staffRole: string | null = null;
  if (isServiceRoleConfigured()) {
    const admin = createSupabaseAdminClient();
    const { data: staffRow, error: staffError } = await admin
      .from("staff_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (staffError) {
      // Never report a server/key problem as "no staff role".
      console.error("[admin-auth] staff_roles lookup failed:", staffError.message);
      await supabase.auth.signOut();
      return NextResponse.json(
        {
          error:
            "Signed in, but the server can't read staff access (database key problem). Check SANCHARI_SUPABASE_SECRET_KEY in .env.local.",
        },
        { status: 503 }
      );
    }
    staffRole = staffRow?.role ?? null;
  } else {
    const { data: staffRow } = await supabase
      .from("staff_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();
    staffRole = staffRow?.role ?? null;
  }

  if (!staffRole) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "Account is authenticated, but has no provisioned staff role in staff_roles." },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, role: staffRole, isDemoAdmin: false });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_ADMIN_COOKIE);

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      // Ignore signout errors if session missing
    }
  }

  return NextResponse.json({ ok: true });
}

