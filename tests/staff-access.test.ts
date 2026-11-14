import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  addStaff: vi.fn(),
  changeStaffRole: vi.fn(),
  removeStaff: vi.fn(),
  resetStaffPassword: vi.fn(),
  listStaff: vi.fn(),
  staffDatabaseReady: vi.fn(),
  changeOwnPassword: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireStaff: m.requireStaff }));
vi.mock("@/lib/data/staff", async (orig) => {
  const real = await orig<typeof import("@/lib/data/staff")>();
  return {
    ...real,
    addStaff: m.addStaff,
    changeStaffRole: m.changeStaffRole,
    removeStaff: m.removeStaff,
    resetStaffPassword: m.resetStaffPassword,
    listStaff: m.listStaff,
    staffDatabaseReady: m.staffDatabaseReady,
    changeOwnPassword: m.changeOwnPassword,
  };
});

import { POST as changeOwn } from "@/app/api/admin/account/password/route";
import { GET, POST } from "@/app/api/admin/staff/route";
import { generatePassword } from "@/components/admin/StaffManager";
import { StaffError, passwordProblem, staffChangeProblem } from "@/lib/data/staff";
import { resetRateLimits } from "@/lib/rate-limit";

const OWNER = { userId: "11111111-1111-4111-8111-111111111111", email: "owner@example.com", staffRole: "owner", isDemoAdmin: false };
const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const post = (body: unknown) =>
  new Request("http://localhost/api/admin/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  m.staffDatabaseReady.mockReturnValue(true);
  m.requireStaff.mockImplementation(async (roles: string[]) => {
    if (!roles.includes("owner")) throw new Error("UNAUTHORIZED_STAFF");
    return OWNER;
  });
});

describe("staff access rules", () => {
  it("never lets you change or remove your own access", () => {
    expect(staffChangeProblem({ actorId: "a", targetId: "a", targetRole: "owner", newRole: null, ownerCount: 3 })).toMatch(/own access/);
    expect(staffChangeProblem({ actorId: "a", targetId: "a", targetRole: "ops", newRole: "owner", ownerCount: 3 })).toMatch(/own role/);
  });

  it("always keeps at least one owner", () => {
    expect(staffChangeProblem({ actorId: "a", targetId: "b", targetRole: "owner", newRole: null, ownerCount: 1 })).toMatch(/at least one owner/);
    expect(staffChangeProblem({ actorId: "a", targetId: "b", targetRole: "owner", newRole: "ops", ownerCount: 1 })).toMatch(/at least one owner/);
    expect(staffChangeProblem({ actorId: "a", targetId: "b", targetRole: "owner", newRole: "ops", ownerCount: 2 })).toBeNull();
    expect(staffChangeProblem({ actorId: "a", targetId: "b", targetRole: "ops", newRole: null, ownerCount: 1 })).toBeNull();
  });

  it("asks for a real password and generates strong ones", () => {
    expect(passwordProblem("short1")).toMatch(/10 characters/);
    expect(passwordProblem("onlyletterspassword")).toMatch(/letters and numbers/);
    expect(passwordProblem("has space 12345")).toMatch(/spaces/);
    expect(passwordProblem("Sanchari2026trip")).toBeNull();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(14);
      expect(passwordProblem(p)).toBeNull();
      expect(p).not.toMatch(/[0O1lI]/);
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });
});

describe("/api/admin/staff", () => {
  it("is owner only: Operations, Support and signed-out people get 403", async () => {
    m.requireStaff.mockRejectedValue(new Error("UNAUTHORIZED_STAFF"));
    expect((await GET()).status).toBe(403);
    expect((await POST(post({ action: "remove", userId: STAFF_ID }) as never)).status).toBe(403);
    expect(m.removeStaff).not.toHaveBeenCalled();
    expect(m.requireStaff).toHaveBeenCalledWith(["owner"]);
  });

  it("lists staff for the owner", async () => {
    m.listStaff.mockResolvedValue([{ userId: STAFF_ID, email: "ops@example.com", role: "ops" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ready: true, staff: [{ email: "ops@example.com" }], you: OWNER.userId });
  });

  it("gives access with the owner as the one who added them", async () => {
    m.addStaff.mockResolvedValue({ member: { email: "new@example.com" }, createdLogin: true });
    const res = await POST(post({ action: "add", email: "New@Example.com", role: "ops", password: "Sanchari2026trip" }) as never);
    expect(res.status).toBe(200);
    expect(m.addStaff).toHaveBeenCalledWith(
      expect.objectContaining({ email: "New@Example.com", role: "ops", password: "Sanchari2026trip" }),
      { userId: OWNER.userId, staffRole: "owner" },
    );
    const json = await res.json();
    expect(json.message).toMatch(/sign in at \/admin/);
    expect(JSON.stringify(json)).not.toContain("Sanchari2026trip"); // the password never comes back
  });

  it("passes the safety rules' message and status through", async () => {
    m.removeStaff.mockRejectedValue(new StaffError("There must always be at least one owner.", 409));
    const res = await POST(post({ action: "remove", userId: STAFF_ID }) as never);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("There must always be at least one owner.");
  });

  it("refuses bad requests and works only with the database", async () => {
    expect((await POST(post({ action: "role", userId: "not-a-uuid", role: "ops" }) as never)).status).toBe(400);
    expect((await POST(post({ action: "role", userId: STAFF_ID, role: "admin" }) as never)).status).toBe(400);
    m.staffDatabaseReady.mockReturnValue(false);
    expect((await POST(post({ action: "remove", userId: STAFF_ID }) as never)).status).toBe(409);
  });
});

describe("/api/admin/account/password", () => {
  const req = (body: unknown) =>
    new Request("http://localhost/api/admin/account/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("lets any staff member change their own password, and limits guessing", async () => {
    m.requireStaff.mockResolvedValue({ ...OWNER, staffRole: "support" });
    m.changeOwnPassword.mockResolvedValue(undefined);
    const ok = await changeOwn(req({ currentPassword: "old-pass-1", newPassword: "NewPassword2026" }) as never);
    expect(ok.status).toBe(200);
    expect(m.changeOwnPassword).toHaveBeenCalledWith(expect.objectContaining({ userId: OWNER.userId, email: OWNER.email }), "old-pass-1", "NewPassword2026");

    m.changeOwnPassword.mockRejectedValue(new StaffError("Your current password is not right.", 403));
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await changeOwn(req({ currentPassword: "guess", newPassword: "NewPassword2026" }) as never)).status);
    expect(statuses.slice(0, 4).every((s) => s === 403)).toBe(true);
    expect(statuses[statuses.length - 1]).toBe(429);
  });

  it("needs a signed-in staff member", async () => {
    m.requireStaff.mockRejectedValue(new Error("UNAUTHORIZED_STAFF"));
    expect((await changeOwn(req({ currentPassword: "x", newPassword: "NewPassword2026" }) as never)).status).toBe(403);
  });
});
