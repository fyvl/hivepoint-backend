import { z } from 'zod';

export const recordUsageSchema = z.object({
    subscriptionId: z.string().trim().min(1),
    endpoint: z.string().trim().min(1).max(200),
    requestCount: z.number().int().min(1),
    occurredAt: z.string().datetime().optional(),
});

export type RecordUsageInput = z.infer<typeof recordUsageSchema>;

export const authorizeUsageSchema = z.object({
    apiKey: z.string().trim().min(1),
    productId: z.string().trim().min(1),
    endpoint: z.string().trim().min(1).max(200),
    requestCount: z.number().int().min(1),
    occurredAt: z.string().datetime().optional(),
    consume: z.boolean().optional(),
});

export type AuthorizeUsageInput = z.infer<typeof authorizeUsageSchema>;
