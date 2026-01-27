import { PrismaClient } from '@prisma/client';

export const resetDb = async (prisma: PrismaClient): Promise<void> => {
    const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';",
    );

    if (!tables.length) {
        return;
    }

    const tableNames = tables.map((table) => `"${table.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`,
    );
};
