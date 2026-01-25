import { ProductStatus, VersionStatus } from '@prisma/client';
import { z } from 'zod';

const parseNumber = (value: unknown): unknown => {
    if (value === undefined || value === null) {
        return undefined;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
            return undefined;
        }
        const parsed = Number(trimmed);
        return Number.isNaN(parsed) ? value : parsed;
    }

    return value;
};

const tagSchema = z.string().trim().min(1).max(30);

export const listProductsQuerySchema = z.object({
    search: z.string().trim().min(1).optional(),
    category: z.string().trim().min(2).max(60).optional(),
    limit: z.preprocess(parseNumber, z.number().int().min(1)).optional(),
    offset: z.preprocess(parseNumber, z.number().int().min(0)).optional(),
});

export const createProductSchema = z.object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(2000),
    category: z.string().trim().min(2).max(60),
    tags: z.array(tagSchema).max(20),
});

export const updateProductSchema = createProductSchema
    .partial()
    .extend({
        status: z.nativeEnum(ProductStatus).optional(),
    })
    .strict();

export const createVersionSchema = z.object({
    version: z.string().trim().min(1).max(20),
    openApiUrl: z.string().trim().min(5).max(2048).url(),
});

export const updateVersionSchema = z
    .object({
        status: z.nativeEnum(VersionStatus).optional(),
        openApiUrl: z.string().trim().min(5).max(2048).url().optional(),
    })
    .strict();

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateVersionInput = z.infer<typeof createVersionSchema>;
export type UpdateVersionInput = z.infer<typeof updateVersionSchema>;
