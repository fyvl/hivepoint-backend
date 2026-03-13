import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

const SALT_ROUNDS = 12;

export const hashPassword = async (password: string): Promise<string> => {
    return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (
    password: string,
    hash: string,
): Promise<boolean> => {
    return bcrypt.compare(password, hash);
};

export const hashToken = async (token: string): Promise<string> => {
    return bcrypt.hash(token, SALT_ROUNDS);
};

export const verifyTokenHash = async (
    token: string,
    hash: string,
): Promise<boolean> => {
    return bcrypt.compare(token, hash);
};

const toBase64Url = (buffer: Buffer): string => {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
};

export const generateRawApiKey = (): string => {
    return `hp_${toBase64Url(randomBytes(32))}`;
};

export const hashApiKey = (rawKey: string, salt: string): string => {
    return createHash('sha256')
        .update(rawKey + salt)
        .digest('hex');
};
