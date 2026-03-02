import { z } from 'zod';

const registerRoleSchema = z.enum(['BUYER', 'SELLER']);

export const registerSchema = z.object({
    email: z
        .string()
        .trim()
        .toLowerCase()
        .email(),
    password: z.string().min(8),
    role: registerRoleSchema.default('BUYER'),
});

export const loginSchema = z.object({
    email: z
        .string()
        .trim()
        .toLowerCase()
        .email(),
    password: z.string().min(1),
});

export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterParsedInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
