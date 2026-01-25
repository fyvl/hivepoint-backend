import { z } from 'zod';

export const recordUsageSchema = z.object({
    subscriptionId: z.string().trim().min(1),
    endpoint: z.string().trim().min(1).max(200),
    requestCount: z.number().int().min(1),
    occurredAt: z.string().datetime().optional(),
});

export type RecordUsageInput = z.infer<typeof recordUsageSchema>;
