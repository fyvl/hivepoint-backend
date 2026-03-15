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
    rateLimitRpm: z.number().int().min(1).optional(),
    isActive: z.boolean().optional(),
});

export const subscribeSchema = z.object({
    planId: z.string().trim().min(1),
});

export const mockPaymentQuerySchema = z.object({
    invoiceId: z.string().trim().min(1),
});

export type GetPlansQuery = z.infer<typeof getPlansQuerySchema>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type MockPaymentQuery = z.infer<typeof mockPaymentQuerySchema>;
