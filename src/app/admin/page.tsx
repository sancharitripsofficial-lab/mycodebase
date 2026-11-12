import type { Metadata } from "next";
import { AdminConsoleClient } from "@/components/AdminConsoleClient";
import { getAuthenticatedActor } from "@/lib/auth";
import { getAdminOperationsData } from "@/lib/data/repository";
import { isSupabaseConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const actor = await getAuthenticatedActor();
  const hasStaffAccess = Boolean(actor && actor.staffRole);

  const initialData =
    hasStaffAccess && actor?.staffRole
      ? await getAdminOperationsData(actor.staffRole === "owner" || actor.staffRole === "ops")
      : null;

  return (
    <AdminConsoleClient
      initialActor={
        hasStaffAccess && actor?.staffRole
          ? { email: actor.email, staffRole: actor.staffRole, isDemoAdmin: actor.isDemoAdmin }
          : null
      }
      supabaseConfigured={isSupabaseConfigured()}
      initialData={initialData}
    />
  );
}
