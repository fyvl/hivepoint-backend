import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppConfigService } from '../../common/config/config.service';
import { ZodValidationPipe } from '../../common/utils/zod-validation.pipe';
import { AuthService } from './auth.service';
import { loginSchema, registerSchema } from './auth.schemas';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
    AccessTokenResponseDto,
    AuthUserResponseDto,
    LogoutResponseDto,
} from './dto/auth-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly configService: AppConfigService,
    ) {}

    @Post('register')
    @ApiOperation({ summary: 'Register a new user' })
    @ApiBody({ type: RegisterDto })
    @ApiOkResponse({ type: AuthUserResponseDto })
    async register(
        @Body(new ZodValidationPipe(registerSchema)) body: RegisterDto,
    ): Promise<AuthUserResponseDto> {
        return this.authService.register(body);
    }

    @Post('login')
    @ApiOperation({ summary: 'Login with email/password' })
    @ApiBody({ type: LoginDto })
    @ApiOkResponse({ type: AccessTokenResponseDto })
    @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
    async login(
        @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
        @Res({ passthrough: true }) response: Response,
    ): Promise<AccessTokenResponseDto> {
        const result = await this.authService.login(body);

        this.setRefreshCookie(response, result.refreshToken);

        return { accessToken: result.accessToken };
    }

    @Post('refresh')
    @ApiOperation({ summary: 'Refresh access token' })
    @ApiOkResponse({ type: AccessTokenResponseDto })
    @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
    async refresh(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<AccessTokenResponseDto> {
        const refreshToken = this.getRefreshTokenFromCookies(request);
        const result = await this.authService.refresh(refreshToken);

        this.setRefreshCookie(response, result.refreshToken);

        return { accessToken: result.accessToken };
    }

    @Post('logout')
    @ApiOperation({ summary: 'Logout and clear refresh token' })
    @ApiOkResponse({ type: LogoutResponseDto })
    async logout(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<LogoutResponseDto> {
        const refreshToken = this.getRefreshTokenFromCookies(request);
        await this.authService.logout(refreshToken);

        response.clearCookie('refreshToken', this.getRefreshCookieOptions());

        return { ok: true };
    }

    private setRefreshCookie(response: Response, refreshToken: string): void {
        response.cookie('refreshToken', refreshToken, this.getRefreshCookieOptions());
    }

    private getRefreshCookieOptions(): {
        httpOnly: boolean;
        sameSite: 'lax';
        secure: boolean;
        domain?: string;
        path: string;
        maxAge: number;
    } {
        const domain = this.configService.cookieDomain;

        return {
            httpOnly: true,
            sameSite: 'lax',
            secure: this.configService.cookieSecure,
            domain: domain || undefined,
            path: '/',
            maxAge: this.configService.jwtRefreshTtlSeconds * 1000,
        };
    }

    private getRefreshTokenFromCookies(request: Request): string | undefined {
        const cookies = request.cookies as { refreshToken?: unknown } | undefined;
        const token = cookies?.refreshToken;
        return typeof token === 'string' ? token : undefined;
    }
}
