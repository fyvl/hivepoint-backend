import { PlanPeriod } from '@prisma/client';
import { z } from 'zod';

export const getPlansQuerySchema = z.object({
    productId: z.string().trim().min(1),
});

export const createPlanSchema = z.object({
    productId: z.string().trim().min(1),
    name: z.string().trim().min(2).max(60),
    priceCents: z.number().int().min(0),
    currency: z.string().trim().min(1).max(10).optional(),
    period: z.nativeEnum(PlanPeriod).optional(),
    quotaRequests: z.number().int().min(1),
    isActive: z.boolean().optional(),
});

export type GetPlansQuery = z.infer<typeof getPlansQuerySchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
