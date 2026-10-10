import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ChannelType, MessageFlags, PermissionsBitField, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { status } from '../src/commands/status.js';

const settings = { REMINDERS_ENABLED: 'false', GUILD_ID: '123456789012345678', GUILD_LEADER_ROLE_ID: '234567890123456789', REMINDER_CHANNEL_ID: '345678901234567890' };

test('status is private, checks prerequisites, and leaves no delivery claims', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'selene-status-'));
    const cwd = process.cwd();
    const original = { ...process.env };
    try {
        process.chdir(directory);
        Object.assign(process.env, settings);
        const replies: {content: string; allowedMentions: {parse: string[]}}[] = [];
        const client = {
            isReady: () => true, ws: { ping: 42 },
            guilds: { fetch: async () => ({
                id: settings.GUILD_ID,
                roles: { fetch: async () => ({ id: settings.GUILD_LEADER_ROLE_ID, mentionable: true }) },
                channels: { fetch: async () => ({ type: ChannelType.GuildText, permissionsFor: () => new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) }) },
                members: { fetchMe: async () => ({}) },
            }) },
        };
        const interaction = {
            client,
            deferReply: async (options: unknown) => { assert.deepEqual(options, { flags: MessageFlags.Ephemeral }); },
            editReply: async (reply: typeof replies[number]) => { replies.push(reply); },
        } as unknown as ChatInputCommandInteraction;
        await status.execute(interaction);
        assert.match(replies[0]!.content, /Discord connection: ready/);
        assert.match(replies[0]!.content, /Gateway latency: 42 ms/);
        assert.match(replies[0]!.content, /Automatic reminders: disabled/);
        assert.match(replies[0]!.content, /permissions: ready/);
        assert.match(replies[0]!.content, /storage: writable/);
        assert.deepEqual(replies[0]!.allowedMentions, { parse: [] });
        assert.deepEqual(await readdir('data/reminder-deliveries'), []);
        client.guilds.fetch = async () => { throw new Error('private API details'); };
        process.env.REMINDERS_ENABLED = 'invalid';
        await status.execute(interaction);
        assert.match(replies[1]!.content, /configuration: invalid/);
        assert.match(replies[1]!.content, /target: check failed/);
        assert.doesNotMatch(replies[1]!.content, /private API details/);
    } finally {
        process.chdir(cwd);
        for (const key of Object.keys(settings)) {
            if (original[key] === undefined) delete process.env[key];
            else process.env[key] = original[key];
        }
        await rm(directory, { recursive: true, force: true });
    }
});
