import { cookies } from "next/headers";
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/types";

export interface AuthenticatedActor {
  userId: string;
  email: string;
  staffRole: StaffRole | null;
  isDemoAdmin: boolean;
}

const DEMO_ADMIN_COOKIE = "sanchari_demo_admin_role";

/**
 * Resolves the current authenticated user and verifies staff role ONLY via the protected
 * `staff_roles` table (never mutable user_metadata or client headers).
 * In local non-production demo mode without Supabase configured, supports a clearly labeled
 * demo admin session cookie for staging evaluation only.
 */
export async function getAuthenticatedActor(): Promise<AuthenticatedActor | null> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production") {
      return null;
    }
    const cookieStore = await cookies();
    const demoRole = cookieStore.get(DEMO_ADMIN_COOKIE)?.value as StaffRole | undefined;
    if (demoRole && ["owner", "ops", "support"].includes(demoRole)) {
      return {
        userId: "00000000-0000-4000-8000-000000000001",
        email: "demo-operator@sanchari.local",
        staffRole: demoRole,
        isDemoAdmin: true,
      };
    }
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  let staffRole: StaffRole | null = null;
  if (isServiceRoleConfigured()) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("staff_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.role && ["owner", "ops", "support"].includes(data.role)) {
      staffRole = data.role as StaffRole;
    }
  } else {
    const { data } = await supabase
      .from("staff_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.role && ["owner", "ops", "support"].includes(data.role)) {
      staffRole = data.role as StaffRole;
    }
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    staffRole,
    isDemoAdmin: false,
  };
}

export async function requireStaff(
  allowedRoles: StaffRole[] = ["owner", "ops", "support"]
): Promise<AuthenticatedActor> {
  const actor = await getAuthenticatedActor();
  if (!actor || !actor.staffRole || !allowedRoles.includes(actor.staffRole)) {
    throw new Error("UNAUTHORIZED_STAFF");
  }
  return actor;
}

