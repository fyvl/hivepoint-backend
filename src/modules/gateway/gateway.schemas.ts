import { z } from 'zod';

const headerRecordSchema = z.record(
    z.string().trim().min(1).max(128),
    z.string().max(4096),
);
const queryRecordSchema = z.record(
    z.string().trim().min(1).max(128),
    z.union([z.string().max(4096), z.number(), z.boolean()]),
);

export const gatewayDispatchSchema = z.object({
    productId: z.string().trim().min(1).max(128),
    path: z.string().trim().min(1).max(2048),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
    headers: headerRecordSchema.optional().default({}),
    query: queryRecordSchema.optional().default({}),
    body: z.unknown().optional(),
    requestCount: z.coerce.number().int().min(1).max(10_000).default(1),
});

export type GatewayDispatchInput = z.infer<typeof gatewayDispatchSchema>;
