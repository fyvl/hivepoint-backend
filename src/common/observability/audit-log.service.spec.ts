import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import { RequestContextService } from './request-context.service';

type PrismaMock = {
    auditLog: {
        create: jest.Mock;
        findMany: jest.Mock;
    };
};

describe('AuditLogService', () => {
    let service: AuditLogService;
    let prisma: PrismaMock;
    let requestContextService: RequestContextService;

    beforeEach(() => {
        prisma = {
            auditLog: {
                create: jest.fn(),
                findMany: jest.fn(),
            },
        };

        requestContextService = new RequestContextService();
        service = new AuditLogService(
            prisma as unknown as PrismaService,
            requestContextService,
        );
    });

    it('records audit logs with the current request id', async () => {
        await requestContextService.run({ requestId: 'req-1' }, async () => {
            await service.record({
                actor: {
                    id: 'admin-1',
                    email: 'admin@example.com',
                    role: Role.ADMIN,
                },
                action: 'ADMIN_HIDE_PRODUCT',
                resourceType: 'API_PRODUCT',
                resourceId: 'prod-1',
                details: {
                    changed: true,
                },
            });
        });

        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: {
                requestId: 'req-1',
                actorUserId: 'admin-1',
                actorEmail: 'admin@example.com',
                actorRole: Role.ADMIN,
                action: 'ADMIN_HIDE_PRODUCT',
                resourceType: 'API_PRODUCT',
                resourceId: 'prod-1',
                details: {
                    changed: true,
                },
            },
        });
    });

    it('lists recent audit logs in reverse chronological order', async () => {
        prisma.auditLog.findMany.mockResolvedValue([]);

        await service.listRecent(25);

        expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
            orderBy: {
                createdAt: 'desc',
            },
            take: 25,
        });
    });
});
