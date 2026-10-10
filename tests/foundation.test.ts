import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { Events, type Interaction } from 'discord.js';
import { createBot } from '../src/bot.js';
import { loadBotConfig, loadDeploymentConfig } from '../src/config.js';

const environment = {
    DISCORD_TOKEN: 'test-token',
    CLIENT_ID: '123456789012345678',
    GUILD_ID: '234567890123456789',
};

test('configuration rejects missing values and malformed Discord IDs', () => {
    for (const name of Object.keys(environment)) {
        assert.throws(() => loadDeploymentConfig({ ...environment, [name]: ' ' }), new RegExp(name));
    }
    for (const name of ['CLIENT_ID', 'GUILD_ID']) {
        assert.throws(() => loadDeploymentConfig({ ...environment, [name]: 'not-an-id' }), new RegExp(name));
    }
    assert.equal(loadDeploymentConfig(environment).guildId, environment.GUILD_ID);
    assert.deepEqual(loadBotConfig({ DISCORD_TOKEN: ' test-token ' }), { token: 'test-token' });
});

test('ping replies, ignores unrelated interactions, and survives a rejected reply', async context => {
    const client = createBot();
    const errors = context.mock.method(console, 'error', () => {});
    const replies: string[] = [];
    const interaction = {
        isChatInputCommand: () => true,
        commandName: 'ping',
        reply: async (text: string) => { replies.push(text); },
    };
    try {
        client.emit(Events.InteractionCreate, interaction as unknown as Interaction);
        client.emit(Events.InteractionCreate, { ...interaction, commandName: 'unknown' } as unknown as Interaction);
        client.emit(Events.InteractionCreate, { ...interaction, isChatInputCommand: () => false } as unknown as Interaction);
        await setImmediate();
        assert.deepEqual(replies, ['Pong!']);
        client.emit(Events.InteractionCreate, {
            ...interaction,
            reply: async () => { throw new Error('Simulated reply failure'); },
        } as unknown as Interaction);
        await setImmediate();
        assert.equal(errors.mock.callCount(), 1);
        client.emit(Events.Error, new Error('Simulated client failure'));
        assert.equal(errors.mock.callCount(), 2);
    } finally {
        await client.destroy();
    }
});

test('entry points exit unsuccessfully when configuration is missing', () => {
    for (const entry of ['index', 'deploy-commands']) {
        const result = spawnSync(process.execPath, ['--import', 'tsx', `src/${entry}.ts`], {
            encoding: 'utf8',
            env: { ...process.env, DOTENV_CONFIG_PATH: '/dev/null', DISCORD_TOKEN: '' },
            timeout: 5000,
        });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /Missing required environment variable: DISCORD_TOKEN/);
    }
});

test('registration and login failures produce a nonzero exit without network access', () => {
    for (const [entry, stub] of [
        ['deploy-commands', 'REST.prototype.put = async () => { throw new Error("Simulated failure"); };'],
        ['index', 'Client.prototype.login = async () => { throw new Error("Simulated failure"); };'],
    ]) {
        const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
            `import { REST, Client } from 'discord.js'; ${stub} await import('./src/${entry}.ts');`,
        ], {
            encoding: 'utf8',
            env: { ...process.env, ...environment, DOTENV_CONFIG_PATH: '/dev/null' },
            timeout: 5000,
        });
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /Simulated failure/);
    }
});
