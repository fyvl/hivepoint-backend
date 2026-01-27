const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const loadEnvFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            return;
        }

        const [rawKey, ...rest] = trimmed.split('=');
        if (!rawKey || rest.length === 0) {
            return;
        }

        const key = rawKey.trim();
        const rawValue = rest.join('=').trim();
        const value = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

        if (!process.env[key]) {
            process.env[key] = value;
        }
    });
};

loadEnvFile(path.join(__dirname, '..', '.env.test'));

const databaseUrlTest = process.env.DATABASE_URL_TEST;
if (!databaseUrlTest) {
    console.error('DATABASE_URL_TEST is required for e2e tests.');
    process.exit(1);
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrlTest;

const env = { ...process.env };

execSync('npx prisma migrate deploy', { stdio: 'inherit', env });
execSync('npx jest --config ./test/jest-e2e.json', { stdio: 'inherit', env });
