import type { Role } from "@/lib/roles";

/**
 * Someone who has the Users module without being a Super Admin can look after ordinary accounts, but cannot make an Admin or a
 * Super Admin, change one, reset one's password or switch one off (that would be a way to become one).
 */
const POWERFUL = ["super_admin", "admin"];
export const canAssignRole = (actor: Role, role: string): boolean => actor === "super_admin" || !POWERFUL.includes(role);
export const canManageUser = (actor: Role, target: string): boolean => actor === "super_admin" || !POWERFUL.includes(target);
