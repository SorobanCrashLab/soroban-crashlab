import { Command } from 'commander';
import { chalk, log } from '../utils/chalk.js';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
const SEED_DATA_DIR = 'src/lib/seed-data';
const SEED_TEMPLATES = {
    testUser: {
        file: 'users/test-user.ts',
        data: {
            id: 'user_12345',
            email: 'test@example.com',
            name: 'Test User',
            role: 'admin',
            createdAt: new Date().toISOString(),
        },
    },
    testRun: {
        file: 'runs/test-run.ts',
        data: {
            id: 'run_12345',
            contractId: 'contract_abc123',
            status: 'completed',
            duration: 120,
            seedCount: 100,
            createdAt: new Date().toISOString(),
        },
    },
    testCampaign: {
        file: 'campaigns/test-campaign.ts',
        data: {
            id: 'campaign_12345',
            name: 'Test Campaign',
            description: 'A test campaign for development',
            status: 'active',
            runCount: 10,
            createdAt: new Date().toISOString(),
        },
    },
    testArtifact: {
        file: 'artifacts/test-artifact.ts',
        data: {
            id: 'artifact_12345',
            name: 'test-contract.wasm',
            type: 'wasm',
            sizeBytes: 1024,
            mime: 'application/wasm',
            createdAt: new Date().toISOString(),
        },
    },
};
function generateSeedFile(name, data, env = 'dev') {
    const content = `/**
 * Seed data: ${name}
 * Environment: ${env}
 * Generated: ${new Date().toISOString()}
 */

export const ${camelCase(name)} = ${JSON.stringify(data, null, 2)};

export default {
  ${camelCase(name)},
};
`;
    return content;
}
function camelCase(str) {
    return str
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase())
        .replace(/ /g, '');
}
function ensureDirectoryExists(dir) {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        log.step(`Created directory: ${dir}`);
    }
}
async function seedDatabase() {
    log.step('Seeding database with test data...');
    // Placeholder for actual database seeding logic
    log.info('Database seeding would happen here (requires database connection)');
}
async function seedRedis() {
    log.step('Seeding Redis with test data...');
    // Placeholder for Redis seeding
    log.info('Redis seeding would happen here (requires Redis connection)');
}
export function seedCommand() {
    return new Command('seed')
        .description('Seed the database with test data')
        .option('--dry-run', 'Show what would be generated without writing files')
        .option('--force', 'Overwrite existing seed files')
        .option('-e, --environment <env>', 'Target environment', 'dev')
        .option('--db', 'Seed the database (requires connection)')
        .option('--redis', 'Seed Redis (requires connection)')
        .action(async (options) => {
        console.log(chalk.bold(`\n🌱 Seed: Development Environment Setup\n`));
        const appDir = join(cwd(), 'apps/web');
        const seedDir = join(appDir, SEED_DATA_DIR);
        if (options.dryRun) {
            console.log(chalk.gray(`Would seed to: ${seedDir}`));
            console.log(chalk.gray('Available seed types:'));
            Object.keys(SEED_TEMPLATES).forEach((key) => {
                console.log(chalk.gray(`  - ${key}`));
            });
            return;
        }
        // Create seed directory
        ensureDirectoryExists(seedDir);
        // Generate seed files
        Object.entries(SEED_TEMPLATES).forEach(([name, template]) => {
            const filePath = join(seedDir, template.file);
            const dir = join(filePath, '..');
            if (existsSync(dir)) {
                ensureDirectoryExists(dir);
            }
            const content = generateSeedFile(name, template.data, options.environment || 'dev');
            writeFileSync(filePath, content, 'utf8');
            log.success(`Created: ${filePath}`);
        });
        // Optionally seed database
        if (options.db) {
            await seedDatabase();
        }
        if (options.redis) {
            await seedRedis();
        }
        console.log(chalk.gray(`\nSeed files generated in: ${seedDir}`));
        console.log(chalk.gray(`\nTo use the seed data:`));
        console.log(chalk.gray(`  import { testUser } from '@/lib/seed-data/users/test-user'`));
    });
}
