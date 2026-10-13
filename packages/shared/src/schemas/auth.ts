import { z } from 'zod';

const email = z.email().trim().toLowerCase().max(254);
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');
const name = z.string().trim().min(2, 'Enter your name').max(80);

export const registerSchema = z.object({
  name,
  email,
  password,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{7,20}$/, 'Enter a valid phone number')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const guestSchema = z.object({
  name: z.string().trim().max(80).optional(),
});

export const upgradeGuestSchema = z.object({ name, email, password });
export type UpgradeGuestInput = z.infer<typeof upgradeGuestSchema>;

export const updateProfileSchema = z.object({
  name: name.optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{7,20}$/)
    .nullable()
    .optional(),
  notificationPrefs: z
    .object({
      push: z.boolean().optional(),
      statusUpdates: z.boolean().optional(),
      verificationRequests: z.boolean().optional(),
    })
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
