import { Role } from '@prisma/client';
import { z } from 'zod';

export const updateMyRoleSchema = z.object({
    role: z.literal(Role.SELLER),
});

export type UpdateMyRoleInput = z.infer<typeof updateMyRoleSchema>;
