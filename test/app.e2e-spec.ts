import { INestApplication } from '@nestjs/common';
import { PrismaClient, Role, SubscriptionStatus } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './helpers/test-app';
import { resetDb } from './helpers/db';

const DEFAULT_PASSWORD = 'password123';

const uniqueEmail = (prefix: string): string => {
    const stamp = Date.now();
    const rand = Math.random().toString(16).slice(2);
    return `${prefix}_${stamp}_${rand}@example.com`;
};

const getEnv = (key: string): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required env var for tests: ${key}`);
    }
    return value;
};

describe('E2E flows', () => {
    let app: INestApplication;
    let prisma: PrismaClient;

    beforeAll(async () => {
        app = await createTestApp();
        prisma = new PrismaClient();
    });

    beforeEach(async () => {
        await resetDb(prisma);
    });

    afterAll(async () => {
        await app.close();
        await prisma.$disconnect();
    });

    const registerUser = async (
        email: string,
        password = DEFAULT_PASSWORD,
        role: Role = Role.BUYER,
    ) => {
        const response = await request(app.getHttpServer())
            .post('/auth/register')
            .send({ email, password, role })
            .expect(201);

        expect(response.body).toEqual(
            expect.objectContaining({
                id: expect.any(String),
                email,
                role,
            }),
        );

        return response.body as { id: string; email: string; role: Role };
    };

    const loginUser = async (email: string, password = DEFAULT_PASSWORD) => {
        const response = await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email, password })
            .expect(201);

        const cookies = response.headers['set-cookie'] as string[] | undefined;
        expect(response.body.accessToken).toEqual(expect.any(String));
        expect(cookies?.length).toBeTruthy();

        return {
            accessToken: response.body.accessToken as string,
            cookies: cookies ?? [],
        };
    };

    const createSellerAndPlan = async () => {
        const sellerEmail = uniqueEmail('seller');
        const seller = await registerUser(sellerEmail, DEFAULT_PASSWORD, Role.SELLER);

        const { accessToken: sellerToken } = await loginUser(sellerEmail);

        const productResponse = await request(app.getHttpServer())
            .post('/catalog/products')
            .set('Authorization', `Bearer ${sellerToken}`)
            .send({
                title: 'Payments API',
                description: 'Accept payments with a single endpoint.',
                category: 'payments',
                tags: ['payments'],
            })
            .expect(201);

        const planResponse = await request(app.getHttpServer())
            .post('/billing/plans')
            .set('Authorization', `Bearer ${sellerToken}`)
            .send({
                productId: productResponse.body.id,
                name: 'Starter',
                priceCents: 1000,
                currency: 'EUR',
                quotaRequests: 1000,
            })
            .expect(201);

        return {
            seller,
            sellerToken,
            product: productResponse.body as { id: string; ownerId: string },
            plan: planResponse.body as { id: string; productId: string },
        };
    };

    it('auth flow: register -> login -> /users/me -> refresh -> logout', async () => {
        const email = uniqueEmail('buyer');
        const registerResponse = await registerUser(email);

        const loginResponse = await loginUser(email);

        const meResponse = await request(app.getHttpServer())
            .get('/users/me')
            .set('Authorization', `Bearer ${loginResponse.accessToken}`)
            .expect(200);

        expect(meResponse.body).toEqual(
            expect.objectContaining({
                id: registerResponse.id,
                email,
                role: Role.BUYER,
            }),
        );

        const refreshResponse = await request(app.getHttpServer())
            .post('/auth/refresh')
            .set('Cookie', loginResponse.cookies)
            .expect(201);

        expect(refreshResponse.body).toEqual(
            expect.objectContaining({
                accessToken: expect.any(String),
            }),
        );

        const refreshCookies = refreshResponse.headers['set-cookie'] as string[] | undefined;
        expect(refreshCookies?.length).toBeTruthy();

        await request(app.getHttpServer())
            .post('/auth/logout')
            .set('Cookie', refreshCookies ?? [])
            .expect(201)
            .expect({ ok: true });
    });

    it('profile flow: summary and password change', async () => {
        const email = uniqueEmail('buyer');
        await registerUser(email);

        const { accessToken, cookies } = await loginUser(email);

        await request(app.getHttpServer())
            .post('/keys')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ label: 'Profile key' })
            .expect(201);

        const summaryResponse = await request(app.getHttpServer())
            .get('/users/profile-summary')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(summaryResponse.body).toEqual(
            expect.objectContaining({
                subscriptionsTotal: 0,
                subscriptionsActive: 0,
                apiKeysActive: 1,
                productsTotal: 0,
                productsPublished: 0,
                canUpgradeToSeller: true,
            }),
        );

        await request(app.getHttpServer())
            .post('/users/change-password')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                currentPassword: 'wrong-password',
                newPassword: 'newpassword123',
            })
            .expect(401);

        await request(app.getHttpServer())
            .post('/users/change-password')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                currentPassword: DEFAULT_PASSWORD,
                newPassword: DEFAULT_PASSWORD,
            })
            .expect(400);

        await request(app.getHttpServer())
            .post('/users/change-password')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                currentPassword: DEFAULT_PASSWORD,
                newPassword: 'newpassword123',
            })
            .expect(201)
            .expect({ ok: true });

        await request(app.getHttpServer())
            .post('/auth/refresh')
            .set('Cookie', cookies)
            .expect(401);

        await request(app.getHttpServer())
            .post('/auth/login')
            .send({ email, password: DEFAULT_PASSWORD })
            .expect(401);

        await loginUser(email, 'newpassword123');
    });

    it('buyer can upgrade to seller via users role endpoint', async () => {
        const email = uniqueEmail('buyer');
        const registered = await registerUser(email);
        const { accessToken } = await loginUser(email);

        await request(app.getHttpServer())
            .post('/catalog/products')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                title: 'Blocked API',
                description: 'This should fail for buyer before role upgrade.',
                category: 'security',
                tags: ['blocked'],
            })
            .expect(403);

        const roleResponse = await request(app.getHttpServer())
            .post('/users/role')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ role: Role.SELLER })
            .expect(201);

        expect(roleResponse.body).toEqual(
            expect.objectContaining({
                id: registered.id,
                email,
                role: Role.SELLER,
            }),
        );

        const { accessToken: sellerToken } = await loginUser(email);

        const productResponse = await request(app.getHttpServer())
            .post('/catalog/products')
            .set('Authorization', `Bearer ${sellerToken}`)
            .send({
                title: 'Seller API',
                description: 'Role-upgraded user can now create products.',
                category: 'security',
                tags: ['seller'],
            })
            .expect(201);

        expect(productResponse.body.ownerId).toBe(registered.id);
    });

    it('seller flow: create product -> create plan', async () => {
        const sellerEmail = uniqueEmail('seller');
        const seller = await registerUser(sellerEmail, DEFAULT_PASSWORD, Role.SELLER);

        const { accessToken: sellerToken } = await loginUser(sellerEmail);

        const productResponse = await request(app.getHttpServer())
            .post('/catalog/products')
            .set('Authorization', `Bearer ${sellerToken}`)
            .send({
                title: 'Usage API',
                description: 'Track API usage with a simple endpoint.',
                category: 'analytics',
                tags: ['analytics'],
            })
            .expect(201);

        expect(productResponse.body.ownerId).toBe(seller.id);

        const planResponse = await request(app.getHttpServer())
            .post('/billing/plans')
            .set('Authorization', `Bearer ${sellerToken}`)
            .send({
                productId: productResponse.body.id,
                name: 'Pro',
                priceCents: 2500,
                currency: 'EUR',
                quotaRequests: 5000,
            })
            .expect(201);

        expect(planResponse.body.productId).toBe(productResponse.body.id);
    });

    it('seller catalog scope: my-products returns only current seller products', async () => {
        const sellerAEmail = uniqueEmail('seller-a');
        const sellerA = await registerUser(sellerAEmail, DEFAULT_PASSWORD, Role.SELLER);
        const { accessToken: sellerAToken } = await loginUser(sellerAEmail);

        const sellerBEmail = uniqueEmail('seller-b');
        const sellerB = await registerUser(sellerBEmail, DEFAULT_PASSWORD, Role.SELLER);
        const { accessToken: sellerBToken } = await loginUser(sellerBEmail);

        await request(app.getHttpServer())
            .post('/catalog/products')
            .set('Authorization', `Bearer ${sellerAToken}`)
            .send({
                title: 'Seller A API',
                description: 'Owned by seller A and should appear only in A workspace.',
                category: 'testing',
                tags: ['a'],
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/catalog/products')
            .set('Authorization', `Bearer ${sellerBToken}`)
            .send({
                title: 'Seller B API',
                description: 'Owned by seller B and should not appear in A workspace.',
                category: 'testing',
                tags: ['b'],
            })
            .expect(201);

        const myProductsResponse = await request(app.getHttpServer())
            .get('/catalog/my-products')
            .set('Authorization', `Bearer ${sellerAToken}`)
            .expect(200);

        expect(myProductsResponse.body.items).toHaveLength(1);
        expect(myProductsResponse.body.items[0]).toEqual(
            expect.objectContaining({
                ownerId: sellerA.id,
                title: 'Seller A API',
            }),
        );
    });

    it('buyer flow: subscribe -> mock succeed -> list subscriptions ACTIVE', async () => {
        const { plan } = await createSellerAndPlan();

        const buyerEmail = uniqueEmail('buyer');
        await registerUser(buyerEmail);
        const { accessToken: buyerToken } = await loginUser(buyerEmail);

        const subscribeResponse = await request(app.getHttpServer())
            .post('/billing/subscribe')
            .set('Authorization', `Bearer ${buyerToken}`)
            .send({ planId: plan.id })
            .expect(201);

        const { subscriptionId, invoiceId } = subscribeResponse.body as {
            subscriptionId: string;
            invoiceId: string;
        };

        await request(app.getHttpServer())
            .post(`/billing/mock/succeed?invoiceId=${invoiceId}`)
            .set('x-mock-payment-secret', 'wrong-secret')
            .expect(403);

        await request(app.getHttpServer())
            .post(`/billing/mock/succeed?invoiceId=${invoiceId}`)
            .set('x-mock-payment-secret', getEnv('MOCK_PAYMENT_SECRET'))
            .expect(201)
            .expect({ ok: true });

        const listResponse = await request(app.getHttpServer())
            .get('/billing/subscriptions')
            .set('Authorization', `Bearer ${buyerToken}`)
            .expect(200);

        expect(listResponse.body.items).toHaveLength(1);
        expect(listResponse.body.items[0]).toEqual(
            expect.objectContaining({
                id: subscriptionId,
                status: SubscriptionStatus.ACTIVE,
            }),
        );
    });

    it('keys flow: create -> list -> revoke', async () => {
        const email = uniqueEmail('buyer');
        await registerUser(email);
        const { accessToken } = await loginUser(email);

        const createResponse = await request(app.getHttpServer())
            .post('/keys')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ label: 'My key' })
            .expect(201);

        expect(createResponse.body.rawKey).toEqual(expect.any(String));

        const listResponse = await request(app.getHttpServer())
            .get('/keys')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(listResponse.body.items).toHaveLength(1);
        expect(listResponse.body.items[0]).toEqual(
            expect.objectContaining({
                id: createResponse.body.id,
                label: 'My key',
                isActive: true,
            }),
        );
        expect(listResponse.body.items[0]).not.toHaveProperty('rawKey');
        expect(listResponse.body.items[0]).not.toHaveProperty('keyHash');

        await request(app.getHttpServer())
            .post(`/keys/${createResponse.body.id}/revoke`)
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(201)
            .expect({ ok: true, keyId: createResponse.body.id });

        const revokedResponse = await request(app.getHttpServer())
            .get('/keys')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(revokedResponse.body.items).toHaveLength(1);
        expect(revokedResponse.body.items[0].isActive).toBe(false);
        expect(revokedResponse.body.items[0].revokedAt).toBeTruthy();
    });

    it('usage flow: ingest record -> summary aggregates usage', async () => {
        const { plan } = await createSellerAndPlan();

        const buyerEmail = uniqueEmail('buyer');
        await registerUser(buyerEmail);
        const { accessToken: buyerToken } = await loginUser(buyerEmail);

        const subscribeResponse = await request(app.getHttpServer())
            .post('/billing/subscribe')
            .set('Authorization', `Bearer ${buyerToken}`)
            .send({ planId: plan.id })
            .expect(201);

        const { subscriptionId, invoiceId } = subscribeResponse.body as {
            subscriptionId: string;
            invoiceId: string;
        };

        await request(app.getHttpServer())
            .post(`/billing/mock/succeed?invoiceId=${invoiceId}`)
            .set('x-mock-payment-secret', getEnv('MOCK_PAYMENT_SECRET'))
            .expect(201)
            .expect({ ok: true });

        await request(app.getHttpServer())
            .post('/usage/record')
            .set('x-usage-secret', 'wrong-secret')
            .send({
                subscriptionId,
                endpoint: '/v1/search',
                requestCount: 2,
            })
            .expect(403);

        await request(app.getHttpServer())
            .post('/usage/record')
            .set('x-usage-secret', getEnv('USAGE_INGEST_SECRET'))
            .send({
                subscriptionId,
                endpoint: '/v1/search',
                requestCount: 3,
            })
            .expect(201)
            .expect({ ok: true });

        const summaryResponse = await request(app.getHttpServer())
            .get('/usage/summary')
            .set('Authorization', `Bearer ${buyerToken}`)
            .expect(200);

        expect(summaryResponse.body.items).toHaveLength(1);
        expect(summaryResponse.body.items[0]).toEqual(
            expect.objectContaining({
                subscriptionId,
                usedRequests: 3,
                quotaRequests: expect.any(Number),
            }),
        );
    });
});
