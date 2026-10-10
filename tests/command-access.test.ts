import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { Collection, Events, MessageFlags, PermissionsBitField, PermissionFlagsBits, type ChatInputCommandInteraction, type Interaction } from 'discord.js';
import { authorizeCommand } from '../src/auth/commands.js';
import { createBot } from '../src/bot.js';
import { commands } from '../src/commands/index.js';
import { loadCommandAccessConfig } from '../src/config.js';

const access = { guildId: '123456789012345678', adminRoleId: '234567890123456789' };

function interaction(overrides = {}) {
    const replies: { content: string; flags: number }[] = [];
    const value = {
        inGuild: () => true,
        guildId: access.guildId,
        member: { roles: [access.adminRoleId] },
        reply: async (payload: { content: string; flags: number }) => { replies.push(payload); },
        ...overrides,
    } as unknown as ChatInputCommandInteraction;
    return { value, replies };
}

test('command access requires valid configured guild and admin role IDs', () => {
    assert.deepEqual(loadCommandAccessConfig({ GUILD_ID: access.guildId, ADMIN_ROLE_ID: access.adminRoleId }), access);
    assert.throws(() => loadCommandAccessConfig({ GUILD_ID: access.guildId }), /ADMIN_ROLE_ID/);
    assert.throws(() => loadCommandAccessConfig({ GUILD_ID: access.guildId, ADMIN_ROLE_ID: 'admin' }), /ADMIN_ROLE_ID/);
    assert.throws(() => loadCommandAccessConfig({ GUILD_ID: access.guildId, ADMIN_ROLE_ID: access.guildId }), /@everyone/);
});

test('exact admin role is accepted for cached and raw Discord members', async () => {
    for (const roles of [[access.adminRoleId], { cache: new Collection([[access.adminRoleId, {}]]) }]) {
        const { value, replies } = interaction({ member: { roles } });
        assert.equal(await authorizeCommand(value, access), true);
        assert.equal(replies.length, 0);
    }
});

test('denies DMs, other servers, absent members, and administrators without the exact role', async () => {
    for (const overrides of [
        { inGuild: () => false },
        { guildId: '345678901234567890' },
        { member: null },
        { member: { roles: [] } },
        { member: { roles: ['345678901234567890'] }, memberPermissions: new PermissionsBitField(PermissionFlagsBits.Administrator) },
        { member: { roles: { cache: new Collection() } } },
    ]) {
        const { value, replies } = interaction(overrides);
        assert.equal(await authorizeCommand(value, access), false);
        assert.equal(replies.length, 1);
        assert.equal(replies[0]?.flags, MessageFlags.Ephemeral);
    }
});

test('every command is disabled by default and protected at dispatch, including ping', async context => {
    const client = createBot(access);
    try {
        for (const command of commands) {
            assert.equal(command.data.toJSON().default_member_permissions, '0');
            const execute = context.mock.method(command, 'execute', async () => {});
            const { value } = interaction({ member: { roles: [] }, isChatInputCommand: () => true, commandName: command.data.name });
            client.emit(Events.InteractionCreate, value as Interaction);
            await setImmediate();
            assert.equal(execute.mock.callCount(), 0);
            const authorized = interaction({ isChatInputCommand: () => true, commandName: command.data.name });
            client.emit(Events.InteractionCreate, authorized.value as Interaction);
            await setImmediate();
            assert.equal(execute.mock.callCount(), 1);
        }
    } finally {
        await client.destroy();
    }
});
