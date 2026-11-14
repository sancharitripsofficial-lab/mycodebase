/**
 * Staff & access (Admin → Settings → Staff & access, owner only).
 *
 * A staff member is a Supabase login plus one row in `staff_roles` (owner / ops / support).
 * The owner creates the login with an email and a starting password and hands those to the
 * person; removing the row ends their admin access on their very next request, because every
 * admin request re-checks `staff_roles` (see requireStaff). Logins are never deleted here, since
 * the same email may also be a customer. Passwords are never logged or returned.
 *
 * SERVER ONLY (service-role key).
 */
import { isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient, createSupabasePublicClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/types";

export const STAFF_ROLES: StaffRole[] = ["owner", "ops", "support"];

export interface StaffMember {
  userId: string;
  email: string;
  role: StaffRole;
  addedAt: string | null;
  addedByEmail: string | null;
  lastSignInAt: string | null;
  notes: string;
}

export interface StaffActor {
  userId: string;
  staffRole: StaffRole | null;
}

/** Thrown with a message that is safe to show the owner. */
export class StaffError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "StaffError";
    this.status = status;
  }
}

export function staffDatabaseReady(): boolean {
  return isSupabaseConfigured() && isServiceRoleConfigured();
}

/** Starting / new passwords: 10–72 characters with at least one letter and one number. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "The password needs at least 10 characters.";
  if (password.length > 72) return "The password can have at most 72 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letters and numbers in the password.";
  if (/\s/.test(password)) return "The password cannot contain spaces.";
  return null;
}

/**
 * The rules for changing who has access, in one place (also used by the tests):
 * nobody changes or removes their own access here, and there is always at least one owner.
 */
export function staffChangeProblem(input: {
  actorId: string;
  targetId: string;
  targetRole: StaffRole;
  /** null = remove access */
  newRole: StaffRole | null;
  ownerCount: number;
}): string | null {
  const { actorId, targetId, targetRole, newRole, ownerCount } = input;
  if (actorId === targetId) {
    return newRole === null
      ? "You can't remove your own access. Ask another owner to do it."
      : "You can't change your own role. Ask another owner to do it.";
  }
  const losesOwner = targetRole === "owner" && newRole !== "owner";
  if (losesOwner && ownerCount <= 1) return "There must always be at least one owner.";
  return null;
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** Every login, by id (small projects: a few pages of 1,000 at most). */
async function allUsers(admin: AdminClient): Promise<Map<string, { email: string; lastSignInAt: string | null }>> {
  const out = new Map<string, { email: string; lastSignInAt: string | null }>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new StaffError(`Could not read logins: ${error.message}`, 502);
    for (const u of data.users) out.set(u.id, { email: (u.email ?? "").toLowerCase(), lastSignInAt: u.last_sign_in_at ?? null });
    if (data.users.length < 1000) break;
  }
  return out;
}

async function audit(admin: AdminClient, actor: StaffActor, action: string, targetId: string, reason: string, after?: Record<string, unknown>) {
  await admin.from("audit_logs").insert({
    actor_user_id: actor.userId,
    actor_role: actor.staffRole,
    action,
    entity_type: "staff",
    entity_id: targetId,
    reason,
    after_state: after ?? null,
  });
}

async function staffRows(admin: AdminClient) {
  const { data, error } = await admin.from("staff_roles").select("user_id, role, assigned_by, notes, created_at");
  if (error) throw new StaffError(`Could not read staff: ${error.message}`, 502);
  return (data ?? []) as { user_id: string; role: StaffRole; assigned_by: string | null; notes: string | null; created_at: string | null }[];
}

export async function listStaff(): Promise<StaffMember[]> {
  const admin = createSupabaseAdminClient();
  const [rows, users] = await Promise.all([staffRows(admin), allUsers(admin)]);
  const order: Record<StaffRole, number> = { owner: 0, ops: 1, support: 2 };
  return rows
    .map((r) => ({
      userId: r.user_id,
      email: users.get(r.user_id)?.email ?? "(login removed)",
      role: r.role,
      addedAt: r.created_at,
      addedByEmail: r.assigned_by ? users.get(r.assigned_by)?.email ?? null : null,
      lastSignInAt: users.get(r.user_id)?.lastSignInAt ?? null,
      notes: r.notes ?? "",
    }))
    .sort((a, b) => order[a.role] - order[b.role] || a.email.localeCompare(b.email));
}

/**
 * Gives a person admin access. New email → a login is created with the owner's starting password
 * (already confirmed, so they can sign in at once). Existing login (e.g. a customer) → only the role
 * is added and their own password stays.
 */
export async function addStaff(
  input: { email: string; role: StaffRole; password: string; notes?: string },
  actor: StaffActor,
): Promise<{ member: StaffMember; createdLogin: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new StaffError("Enter a valid email address.");
  if (!STAFF_ROLES.includes(input.role)) throw new StaffError("Pick a role.");
  const admin = createSupabaseAdminClient();
  const users = await allUsers(admin);
  const existing = [...users.entries()].find(([, u]) => u.email === email)?.[0] ?? null;

  let userId = existing;
  let createdLogin = false;
  if (!userId) {
    const problem = passwordProblem(input.password);
    if (problem) throw new StaffError(problem);
    const { data, error } = await admin.auth.admin.createUser({ email, password: input.password, email_confirm: true });
    if (error || !data.user) throw new StaffError(`Could not create the login: ${error?.message ?? "unknown error"}`, 502);
    userId = data.user.id;
    createdLogin = true;
  } else {
    const rows = await staffRows(admin);
    const already = rows.find((r) => r.user_id === userId);
    if (already) throw new StaffError(`${email} already has admin access (${roleName(already.role)}).`, 409);
  }

  const { error: insertError } = await admin
    .from("staff_roles")
    .insert({ user_id: userId, role: input.role, assigned_by: actor.userId, notes: (input.notes ?? "").trim().slice(0, 200) || null });
  if (insertError) {
    // Never leave a fresh login without its role half-made.
    if (createdLogin) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw new StaffError(`Could not give access: ${insertError.message}`, 502);
  }
  await audit(admin, actor, "staff_added", userId, `Admin access given to ${email} as ${roleName(input.role)}`, {
    email,
    role: input.role,
    createdLogin,
  });
  const member = (await listStaff()).find((m) => m.userId === userId);
  if (!member) throw new StaffError("Access was given, but the list could not be refreshed.", 502);
  return { member, createdLogin };
}

async function guardChange(admin: AdminClient, actor: StaffActor, targetId: string, newRole: StaffRole | null) {
  const rows = await staffRows(admin);
  const target = rows.find((r) => r.user_id === targetId);
  if (!target) throw new StaffError("That person does not have admin access.", 404);
  const problem = staffChangeProblem({
    actorId: actor.userId,
    targetId,
    targetRole: target.role,
    newRole,
    ownerCount: rows.filter((r) => r.role === "owner").length,
  });
  if (problem) throw new StaffError(problem, 409);
  return target;
}

export async function changeStaffRole(targetId: string, role: StaffRole, actor: StaffActor): Promise<void> {
  if (!STAFF_ROLES.includes(role)) throw new StaffError("Pick a role.");
  const admin = createSupabaseAdminClient();
  const target = await guardChange(admin, actor, targetId, role);
  if (target.role === role) return;
  const { error } = await admin.from("staff_roles").update({ role, updated_at: new Date().toISOString() }).eq("user_id", targetId);
  if (error) throw new StaffError(`Could not change the role: ${error.message}`, 502);
  await audit(admin, actor, "staff_role_changed", targetId, `Role changed from ${roleName(target.role)} to ${roleName(role)}`, {
    from: target.role,
    to: role,
  });
}

export async function removeStaff(targetId: string, actor: StaffActor): Promise<void> {
  const admin = createSupabaseAdminClient();
  const target = await guardChange(admin, actor, targetId, null);
  const { error } = await admin.from("staff_roles").delete().eq("user_id", targetId);
  if (error) throw new StaffError(`Could not remove access: ${error.message}`, 502);
  await audit(admin, actor, "staff_removed", targetId, `Admin access removed (was ${roleName(target.role)})`, { was: target.role });
}

/** The owner sets a new password for a staff member who forgot theirs (not for themselves). */
export async function resetStaffPassword(targetId: string, password: string, actor: StaffActor): Promise<void> {
  if (targetId === actor.userId) throw new StaffError("Change your own password under My password.", 409);
  const problem = passwordProblem(password);
  if (problem) throw new StaffError(problem);
  const admin = createSupabaseAdminClient();
  const rows = await staffRows(admin);
  if (!rows.some((r) => r.user_id === targetId)) throw new StaffError("That person does not have admin access.", 404);
  const { error } = await admin.auth.admin.updateUserById(targetId, { password });
  if (error) throw new StaffError(`Could not set the password: ${error.message}`, 502);
  await audit(admin, actor, "staff_password_reset", targetId, "Password set by the owner");
}

/** Any staff member changes their own password; the current one is checked first. */
export async function changeOwnPassword(
  actor: StaffActor & { email: string },
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const problem = passwordProblem(newPassword);
  if (problem) throw new StaffError(problem);
  if (newPassword === currentPassword) throw new StaffError("The new password must be different from the current one.");
  // A throwaway client that keeps no session: only proves the current password is right.
  const check = createSupabasePublicClient();
  const { error: signInError } = await check.auth.signInWithPassword({ email: actor.email, password: currentPassword });
  if (signInError) throw new StaffError("Your current password is not right.", 403);
  await check.auth.signOut().catch(() => undefined);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(actor.userId, { password: newPassword });
  if (error) throw new StaffError(`Could not change the password: ${error.message}`, 502);
  await audit(admin, actor, "own_password_changed", actor.userId, "Changed their own password");
}

export function roleName(role: StaffRole): string {
  return role === "owner" ? "Owner" : role === "ops" ? "Operations" : "Support";
}
