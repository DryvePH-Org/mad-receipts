// The six roles, and the one place that says what each may do. Pages and actions ask these helpers, not the role names.
//   Super Admin: everything, including the administration tools (Settings, Users, Sync jobs).
//   Admin: everything in the modules, edit, delete and add, but not the administration tools.
//   Buying: the IN documents of a car: they upload, scan, check and approve the papers the car came with. They only look at the other tabs.
//   Documentation: every tab of a car (IN documents, OUT documents, Sale and transfer); she focuses on the transfer of the originals.
//   Marketing: adds the OUT documents (the buyer's ID, the deed, the AR), looks at the rest of Car documents, Car Inventory and Repairs.
//   Sales: adds the OUT documents after a sale, reads the rest of the car page, and changes Car Inventory and Repairs.

export type Role = "super_admin" | "admin" | "buying" | "documentation" | "marketing" | "sales";

export const ROLES: Role[] = ["super_admin", "admin", "buying", "documentation", "marketing", "sales"];
export const ROLE_LABELS: Record<Role, string> = { super_admin: "Super Admin", admin: "Admin", buying: "Buying", documentation: "Documentation", marketing: "Online Marketing", sales: "Sales" };

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as string[]).includes(v);
/** What the database may still hold from before the roles: approver is an Admin. */
export const roleFromDb = (v: unknown): Role => (v === "approver" ? "admin" : isRole(v) ? v : "sales");

/** The administration tools: Settings, Users, Sync jobs, the bot set-up, deleting data. */
export const isSuper = (r: Role): boolean => r === "super_admin";
/** Oversees everything in the modules: prices, decisions, deleting a transaction or a car, the activity log. */
export const isAdmin = (r: Role): boolean => r === "super_admin" || r === "admin";
/** Changes the IN documents: uploads the papers the car came with, scans, checks, approves and moves the folders. Sales and Online Marketing only read them. */
export const editsPapers = (r: Role): boolean => r === "super_admin" || r === "admin" || r === "buying" || r === "documentation";
/** Adds the OUT documents after a sale: the buyer's ID, the deed and the AR. Buying only reads them. */
export const editsOut = (r: Role): boolean => r !== "buying";
/** Reviews and approves the OUT documents: Sales (and the Admins). Online Marketing and Documentation add the photos; they do not approve them. */
export const approvesOut = (r: Role): boolean => r === "super_admin" || r === "admin" || r === "sales";
/** Moves a car's folder to Sold (from the OUT documents): Sales and Documentation, and the Admins. */
export const movesToSold = (r: Role): boolean => r === "super_admin" || r === "admin" || r === "sales" || r === "documentation";
/** Changes the Sale and transfer tab: hands the originals to Sir Jep, takes them back, releases them to the buyer. Everyone else who sees the sale only looks. */
export const editsTransfer = (r: Role): boolean => r === "super_admin" || r === "admin" || r === "documentation";
/** Changes prices and states in Car Inventory, and decides on repairs. */
export const editsCars = (r: Role): boolean => r === "super_admin" || r === "admin" || r === "sales";
/** Sees the papers that are kept private from Sales and Online Marketing (the notarized closed deed of sale). */
export const seesPrivateDocs = (r: Role): boolean => r === "super_admin" || r === "admin" || r === "buying" || r === "documentation";
/** Sees the sale and transfer records of cars (buyer names, agreed prices). */
export const seesSales = (r: Role): boolean => r !== "marketing";
