import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '../errors/app.error';
import { ErrorCodes } from '../errors/error.codes';

type SafeExternalUrlOptions = {
    allowPrivateNetworkTargets: boolean;
    message: string;
    httpStatus: number;
};

export const assertSafeExternalHttpUrl = async (
    urlString: string,
    options: SafeExternalUrlOptions,
): Promise<URL> => {
    const url = parseUrl(urlString, options);

    if (options.allowPrivateNetworkTargets) {
        return url;
    }

    if (hasBlockedHostname(url.hostname)) {
        throw buildUnsafeUrlError(urlString, options, 'BLOCKED_HOSTNAME');
    }

    const addresses = await resolveAddresses(url.hostname, urlString, options);
    if (addresses.some(isPrivateAddress)) {
        throw buildUnsafeUrlError(urlString, options, 'PRIVATE_ADDRESS');
    }

    return url;
};

const parseUrl = (urlString: string, options: SafeExternalUrlOptions): URL => {
    let url: URL;
    try {
        url = new URL(urlString);
    } catch {
        throw buildUnsafeUrlError(urlString, options, 'INVALID_URL');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw buildUnsafeUrlError(urlString, options, 'UNSUPPORTED_PROTOCOL');
    }

    if (url.username || url.password || !url.hostname) {
        throw buildUnsafeUrlError(urlString, options, 'INVALID_AUTHORITY');
    }

    return url;
};

const hasBlockedHostname = (hostname: string): boolean => {
    const normalized = hostname.trim().toLowerCase();
    return (
        normalized === 'localhost' ||
        normalized.endsWith('.localhost') ||
        normalized.endsWith('.local')
    );
};

const resolveAddresses = async (
    hostname: string,
    urlString: string,
    options: SafeExternalUrlOptions,
): Promise<string[]> => {
    if (isIP(hostname)) {
        return [hostname];
    }

    try {
        const results = await lookup(hostname, { all: true });
        return results.map((item) => item.address);
    } catch {
        throw buildUnsafeUrlError(urlString, options, 'DNS_LOOKUP_FAILED');
    }
};

const isPrivateAddress = (address: string): boolean => {
    const ipVersion = isIP(address);
    if (ipVersion === 4) {
        return isPrivateIpv4(address);
    }

    if (ipVersion === 6) {
        return isPrivateIpv6(address);
    }

    return true;
};

const isPrivateIpv4 = (address: string): boolean => {
    const parts = address.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
        return true;
    }

    const [a, b] = parts;
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19))
    );
};

const isPrivateIpv6 = (address: string): boolean => {
    const normalized = address.trim().toLowerCase();

    return (
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb')
    );
};

const buildUnsafeUrlError = (
    urlString: string,
    options: SafeExternalUrlOptions,
    reason: string,
): AppError => {
    return new AppError({
        code: ErrorCodes.UNSAFE_EXTERNAL_URL,
        message: options.message,
        httpStatus: options.httpStatus,
        details: {
            reason,
            url: urlString,
        },
    });
};
