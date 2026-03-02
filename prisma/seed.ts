import { PrismaClient, ProductStatus, Role, VersionStatus } from '@prisma/client';
import { hashPassword } from '../src/common/utils/crypto';

interface SeedSeller {
    id: string;
    email: string;
}

interface SeedVersion {
    id: string;
    version: string;
    openApiUrl: string;
}

interface SeedPlan {
    id: string;
    name: string;
    priceCents: number;
    quotaRequests: number;
}

interface SeedProduct {
    id: string;
    ownerEmail: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    versions: SeedVersion[];
    plans: SeedPlan[];
}

const prisma = new PrismaClient();
const defaultPassword = 'Password123!';

const seedSellers: SeedSeller[] = [
    {
        id: 'e7b82a7f-464f-46c5-8b72-c1f2f2f6084f',
        email: 'seller.integrations@hivepoint.dev',
    },
    {
        id: 'e734c4fb-6c0a-4ad3-9555-3f704c67f602',
        email: 'seller.platform@hivepoint.dev',
    },
    {
        id: 'e1be0f15-4dbf-43de-aa13-3f88ee251de9',
        email: 'seller.ai@hivepoint.dev',
    },
];

const seedProducts: SeedProduct[] = [
    {
        id: '1d622fd5-0a70-46c8-ac11-4d6836db10f9',
        ownerEmail: 'seller.integrations@hivepoint.dev',
        title: 'GitHub REST API',
        description:
            'Official GitHub REST API specification for repositories, issues, pull requests, and automation workflows.',
        category: 'developer-tools',
        tags: ['github', 'devtools', 'ci'],
        versions: [
            {
                id: '6f08d5bf-3f74-44a1-8d52-97c0ce4c8c4c',
                version: '2022-11-28',
                openApiUrl:
                    'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json',
            },
        ],
        plans: [
            {
                id: 'c0da91f6-f99c-489f-bf26-50f2923f3ff4',
                name: 'Starter',
                priceCents: 1900,
                quotaRequests: 10000,
            },
            {
                id: 'af5312fd-5cd8-4be9-9f97-44fb8c3f0f9a',
                name: 'Pro',
                priceCents: 6900,
                quotaRequests: 100000,
            },
        ],
    },
    {
        id: 'b6b4d5db-e4e2-4929-bd44-5b3c6bdcbb2c',
        ownerEmail: 'seller.platform@hivepoint.dev',
        title: 'Stripe API',
        description:
            'Payment API for checkout, customers, subscriptions, invoices, and webhook-driven billing workflows.',
        category: 'payments',
        tags: ['payments', 'billing', 'fintech'],
        versions: [
            {
                id: '4d5d48e4-5336-4858-af00-7ce47b725f32',
                version: '2024-11-20',
                openApiUrl: 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json',
            },
        ],
        plans: [
            {
                id: '79abfb39-5fdd-4e41-8e8f-960e9569a55f',
                name: 'Sandbox',
                priceCents: 2900,
                quotaRequests: 25000,
            },
            {
                id: 'cd24b0c7-1646-4ef9-9a72-bf26abe75c90',
                name: 'Business',
                priceCents: 11900,
                quotaRequests: 250000,
            },
        ],
    },
    {
        id: '6f4bfe8e-574c-4ec8-8473-877f8512fd1e',
        ownerEmail: 'seller.ai@hivepoint.dev',
        title: 'OpenAI API',
        description:
            'Generative AI API for chat, embeddings, audio, image generation, and assistant-style workflows.',
        category: 'ai',
        tags: ['ai', 'llm', 'embeddings'],
        versions: [
            {
                id: '975cfd18-f9c9-4bb8-bf38-6cbf5fd73657',
                version: '2024-02-01',
                openApiUrl: 'https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml',
            },
        ],
        plans: [
            {
                id: 'd17c8033-bf91-4efd-bf77-8a7f452f84b6',
                name: 'Builder',
                priceCents: 3900,
                quotaRequests: 20000,
            },
            {
                id: '69ea7088-1227-4f3b-8ab0-f2c107f6ca2d',
                name: 'Scale',
                priceCents: 15900,
                quotaRequests: 300000,
            },
        ],
    },
    {
        id: '8fce0f6f-6ea6-422d-b6f0-3fce6e34a15d',
        ownerEmail: 'seller.integrations@hivepoint.dev',
        title: 'Petstore Demo API',
        description:
            'Well-known OpenAPI sample for orders, inventory, and pet management. Useful for integration testing.',
        category: 'samples',
        tags: ['demo', 'openapi', 'testing'],
        versions: [
            {
                id: 'dbf50fab-b42d-465f-8ea3-f5bd45e540b8',
                version: 'v3',
                openApiUrl: 'https://petstore3.swagger.io/api/v3/openapi.json',
            },
        ],
        plans: [
            {
                id: '96a27377-66b1-4316-9959-11e6acdc8f73',
                name: 'Free',
                priceCents: 0,
                quotaRequests: 5000,
            },
            {
                id: 'fef36027-ab4f-4a91-8f3e-208b3f588f5f',
                name: 'Unlimited',
                priceCents: 2900,
                quotaRequests: 1000000,
            },
        ],
    },
];

const upsertSellers = async (): Promise<Record<string, string>> => {
    const passwordHash = await hashPassword(defaultPassword);
    const sellerIdsByEmail: Record<string, string> = {};

    for (const seller of seedSellers) {
        const user = await prisma.user.upsert({
            where: {
                email: seller.email,
            },
            update: {
                role: Role.SELLER,
            },
            create: {
                id: seller.id,
                email: seller.email,
                passwordHash,
                role: Role.SELLER,
            },
            select: {
                id: true,
                email: true,
            },
        });

        sellerIdsByEmail[user.email] = user.id;
    }

    return sellerIdsByEmail;
};

const upsertCatalog = async (sellerIdsByEmail: Record<string, string>): Promise<void> => {
    for (const product of seedProducts) {
        const ownerId = sellerIdsByEmail[product.ownerEmail];

        if (!ownerId) {
            throw new Error(`Missing owner for product ${product.id}: ${product.ownerEmail}`);
        }

        await prisma.$transaction(async (tx) => {
            await tx.apiProduct.upsert({
                where: {
                    id: product.id,
                },
                update: {
                    ownerId,
                    title: product.title,
                    description: product.description,
                    category: product.category,
                    tags: product.tags,
                    status: ProductStatus.PUBLISHED,
                },
                create: {
                    id: product.id,
                    ownerId,
                    title: product.title,
                    description: product.description,
                    category: product.category,
                    tags: product.tags,
                    status: ProductStatus.PUBLISHED,
                },
            });

            for (const version of product.versions) {
                await tx.apiVersion.upsert({
                    where: {
                        id: version.id,
                    },
                    update: {
                        productId: product.id,
                        version: version.version,
                        openApiUrl: version.openApiUrl,
                        status: VersionStatus.PUBLISHED,
                    },
                    create: {
                        id: version.id,
                        productId: product.id,
                        version: version.version,
                        openApiUrl: version.openApiUrl,
                        status: VersionStatus.PUBLISHED,
                    },
                });
            }

            for (const plan of product.plans) {
                await tx.plan.upsert({
                    where: {
                        id: plan.id,
                    },
                    update: {
                        productId: product.id,
                        name: plan.name,
                        priceCents: plan.priceCents,
                        quotaRequests: plan.quotaRequests,
                        isActive: true,
                    },
                    create: {
                        id: plan.id,
                        productId: product.id,
                        name: plan.name,
                        priceCents: plan.priceCents,
                        quotaRequests: plan.quotaRequests,
                        isActive: true,
                    },
                });
            }
        });
    }
};

const seed = async (): Promise<void> => {
    const sellersByEmail = await upsertSellers();
    await upsertCatalog(sellersByEmail);

    const totalProducts = seedProducts.length;
    const totalVersions = seedProducts.reduce((sum, product) => sum + product.versions.length, 0);
    const totalPlans = seedProducts.reduce((sum, product) => sum + product.plans.length, 0);

    console.log(`Seed complete: ${seedSellers.length} sellers, ${totalProducts} products, ${totalVersions} versions, ${totalPlans} plans.`);
    console.log(`Default password for new seeded sellers: ${defaultPassword}`);
};

seed()
    .catch((error) => {
        console.error('Seed failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
