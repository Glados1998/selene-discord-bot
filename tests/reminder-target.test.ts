import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChannelType, PermissionsBitField, PermissionFlagsBits, type Client } from 'discord.js';
import { loadReminderConfig } from '../src/config.js';
import { resolveReminderTarget } from '../src/reminders/target.js';

const config = { guildId: '123456789012345678', roleId: '234567890123456789', channelId: '345678901234567890' };

function fixture({ everyone = false, missingRole = false, mentionable = true, type = ChannelType.GuildText, flags = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] } = {}) {
    const role = { id: everyone ? config.guildId : config.roleId, mentionable };
    const channel = { id: config.channelId, type, permissionsFor: () => new PermissionsBitField(flags) };
    const guild = {
        id: config.guildId,
        roles: { fetch: async () => missingRole ? null : role },
        channels: { fetch: async () => channel },
        members: { fetchMe: async () => ({}) },
    };
    return { guilds: { fetch: async () => guild } } as unknown as Client;
}

test('reminder configuration requires valid role and channel IDs', () => {
    const env = { GUILD_ID: config.guildId, GUILD_LEADER_ROLE_ID: config.roleId, REMINDER_CHANNEL_ID: config.channelId };
    assert.deepEqual(loadReminderConfig(env), config);
    for (const key of Object.keys(env)) {
        for (const value of ['', 'guild leader']) {
            assert.throws(() => loadReminderConfig({ ...env, [key]: value }), new RegExp(key));
        }
    }
});

test('resolves a mentionable role in a writable text channel', async () => {
    const result = await resolveReminderTarget(fixture(), config);
    assert.equal(result.role.id, config.roleId);
    assert.equal(result.channel.id, config.channelId);
});

test('rejects invalid roles, channels, and insufficient permissions', async () => {
    await assert.rejects(resolveReminderTarget(fixture({ everyone: true }), config), /other than @everyone/);
    await assert.rejects(resolveReminderTarget(fixture({ missingRole: true }), config), /existing role/);
    await assert.rejects(resolveReminderTarget(fixture({ type: ChannelType.GuildVoice }), config), /text channel/);
    await assert.rejects(resolveReminderTarget(fixture({ flags: [PermissionFlagsBits.ViewChannel] }), config), /Send Messages/);
    await assert.rejects(resolveReminderTarget(fixture({ flags: [PermissionFlagsBits.SendMessages] }), config), /View Channel/);
    await assert.rejects(resolveReminderTarget(fixture({ mentionable: false }), config), /mentionable/);
});

test('allows a non-mentionable role when the bot has Mention Everyone', async () => {
    await resolveReminderTarget(fixture({ mentionable: false, flags: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.MentionEveryone] }), config);
});
