import { z } from "zod";

/**
 * Checks the forms run in the browser before anything is sent. The server actions repeat the same
 * checks, so these only give faster, friendlier feedback; they are not a security boundary.
 */
export const loginSchema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password is too long.");

export const createUserSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the person's name.").max(100, "That name is too long."),
  email: z.email("Enter a valid email.").max(254),
  password: passwordSchema,
  role: z.enum(["sales", "approver", "documentation", "admin"]),
});

export const resetPasswordSchema = z.object({ password: passwordSchema });
