import { z } from 'zod';

export const createKeySchema = z.object({
    label: z.string().trim().min(1).max(60),
});

export type CreateKeyInput = z.infer<typeof createKeySchema>;
