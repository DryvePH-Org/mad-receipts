import type { Role } from "@/lib/navigation";

/**
 * Someone who has the Users module without being an Admin can look after ordinary accounts, but cannot make an Admin,
 * change an Admin, reset an Admin's password or switch an Admin off (that would be a way to become Admin).
 */
export const canAssignRole = (actor: Role, role: string): boolean => actor === "admin" || role !== "admin";
export const canManageUser = (actor: Role, target: string): boolean => actor === "admin" || target !== "admin";
