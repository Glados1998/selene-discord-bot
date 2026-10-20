import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChannelType, PermissionsBitField, PermissionFlagsBits, type Client } from 'discord.js';
import { buildReminderMessage, sendReminder } from '../src/reminders/send.js';

const config = { guildId: '123456789012345678', roleId: '234567890123456789', channelId: '345678901234567890' };

test('delivery sends once to the resolved channel and does not ping any role or user', async () => {
    const payloads: unknown[] = [];
    const message = { url: 'https://discord.com/channels/test' };
    const channel = {
        type: ChannelType.GuildText,
        permissionsFor: () => new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]),
        send: async (payload: unknown) => { payloads.push(payload); return message; },
    };
    const client = { guilds: { fetch: async (id: string) => {
        assert.equal(id, config.guildId);
        return {
            id,
            roles: { fetch: async (roleId: string) => {
                assert.equal(roleId, config.roleId);
                return { id: roleId, mentionable: true };
            } },
            channels: { fetch: async (channelId: string) => { assert.equal(channelId, config.channelId); return channel; } },
            members: { fetchMe: async () => ({}) },
        };
    } } } as unknown as Client;
    assert.equal(await sendReminder(client, config), message);
    assert.deepEqual(payloads, [buildReminderMessage(config.roleId)]);
    assert.deepEqual(buildReminderMessage(config.roleId).allowedMentions, {
        parse: [], roles: [], users: [], repliedUser: false,
    });
    channel.permissionsFor = () => new PermissionsBitField();
    await assert.rejects(sendReminder(client, config), /View Channel/);
    assert.equal(payloads.length, 1);
});
