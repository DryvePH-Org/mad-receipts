// The five roles, and the one place that says what each may do. Pages and actions ask these helpers, not the role names.
//   Super Admin: everything, including the administration tools (Settings, Users, Sync jobs).
//   Admin: everything in the modules, edit, delete and add, but not the administration tools.
//   Buying: the car papers (what Documentation was).
//   Marketing: look at Car status, Car documents and Repairs, change nothing.
//   Sales: change the car papers, Car status and Repairs.

export type Role = "super_admin" | "admin" | "buying" | "marketing" | "sales";

export const ROLES: Role[] = ["super_admin", "admin", "buying", "marketing", "sales"];
export const ROLE_LABELS: Record<Role, string> = { super_admin: "Super Admin", admin: "Admin", buying: "Buying", marketing: "Online Marketing", sales: "Sales" };

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as string[]).includes(v);
/** What the database may still hold from before the five roles: approver is an Admin, documentation is Buying. */
export const roleFromDb = (v: unknown): Role => (v === "approver" ? "admin" : v === "documentation" ? "buying" : isRole(v) ? v : "sales");

/** The administration tools: Settings, Users, Sync jobs, the bot set-up, deleting data. */
export const isSuper = (r: Role): boolean => r === "super_admin";
/** Oversees everything in the modules: prices, decisions, deleting a transaction or a car, the activity log. */
export const isAdmin = (r: Role): boolean => r === "super_admin" || r === "admin";
/** Changes the car papers, scans, checks and moves the folders. */
export const editsPapers = (r: Role): boolean => r !== "marketing";
/** Changes prices and states in Car status, and decides on repairs. */
export const editsCars = (r: Role): boolean => r === "super_admin" || r === "admin" || r === "sales";
/** Sees the sale and transfer records of cars (buyer names, agreed prices). */
export const seesSales = (r: Role): boolean => r !== "marketing";
