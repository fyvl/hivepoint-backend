import { Role } from '@prisma/client';
import { z } from 'zod';

export const updateMyRoleSchema = z.object({
    role: z.literal(Role.SELLER),
});

export const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
    })
    .refine((value) => value.currentPassword !== value.newPassword, {
        message: 'NEW_PASSWORD_MUST_DIFFER',
        path: ['newPassword'],
    });

export type UpdateMyRoleInput = z.infer<typeof updateMyRoleSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
