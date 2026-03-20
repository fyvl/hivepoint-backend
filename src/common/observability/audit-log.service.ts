import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../decorators/user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from './request-context.service';

type AuditLogDbClient = Prisma.TransactionClient | PrismaClient | PrismaService;

export type RecordAuditLogInput = {
    actor?: AuthenticatedUser;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Prisma.InputJsonValue;
};

type AuditLogRecord = {
    id: string;
    requestId: string | null;
    actorUserId: string | null;
    actorEmail: string | null;
    actorRole: Role | null;
    action: string;
    resourceType: string;
    resourceId: string;
    details: Prisma.JsonValue | null;
    createdAt: Date;
};

@Injectable()
export class AuditLogService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly requestContextService: RequestContextService,
    ) {}

    async record(input: RecordAuditLogInput): Promise<void> {
        await this.recordWithClient(this.prisma, input);
    }

    async recordWithClient(
        client: AuditLogDbClient,
        input: RecordAuditLogInput,
    ): Promise<void> {
        await client.auditLog.create({
            data: {
                requestId: this.requestContextService.getRequestId(),
                actorUserId: input.actor?.id,
                actorEmail: input.actor?.email,
                actorRole: input.actor?.role,
                action: input.action,
                resourceType: input.resourceType,
                resourceId: input.resourceId,
                details: input.details,
            },
        });
    }

    async listRecent(limit: number): Promise<AuditLogRecord[]> {
        return this.prisma.auditLog.findMany({
            orderBy: {
                createdAt: 'desc',
            },
            take: limit,
        });
    }
}
