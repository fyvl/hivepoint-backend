import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env.schema';

@Injectable()
export class AppConfigService {
    constructor(private readonly configService: ConfigService<Env, true>) {}

    get port(): number {
        return this.configService.getOrThrow('PORT');
    }

    get databaseUrl(): string {
        return this.configService.getOrThrow('DATABASE_URL');
    }

    get jwtAccessSecret(): string {
        return this.configService.getOrThrow('JWT_ACCESS_SECRET');
    }

    get jwtRefreshSecret(): string {
        return this.configService.getOrThrow('JWT_REFRESH_SECRET');
    }

    get jwtAccessTtlSeconds(): number {
        return this.configService.getOrThrow('JWT_ACCESS_TTL_SECONDS');
    }

    get jwtRefreshTtlSeconds(): number {
        return this.configService.getOrThrow('JWT_REFRESH_TTL_SECONDS');
    }

    get corsOrigins(): string[] {
        const raw = this.configService.getOrThrow<string>('CORS_ORIGINS');
        return raw
            .split(',')
            .map((origin) => origin.trim())
            .filter((origin) => origin.length > 0);
    }

    get cookieDomain(): string | undefined {
        return this.configService.get('COOKIE_DOMAIN');
    }

    get cookieSecure(): boolean {
        return this.configService.getOrThrow('COOKIE_SECURE');
    }

    get redisUrl(): string | undefined {
        return this.configService.get('REDIS_URL');
    }
}
