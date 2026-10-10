import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChannelType, PermissionsBitField, PermissionFlagsBits, MessageFlags, type Client, type ChatInputCommandInteraction } from 'discord.js';
import { buildReminderMessage, sendReminder } from '../src/reminders/send.js';
import { reminderSend } from '../src/commands/reminder-send.js';

const config = { guildId: '123456789012345678', roleId: '234567890123456789', channelId: '345678901234567890' };

test('delivery sends once to the resolved channel and allows only the configured role mention', async () => {
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
        parse: [], roles: [config.roleId], users: [], repliedUser: false,
    });
    channel.permissionsFor = () => new PermissionsBitField();
    await assert.rejects(sendReminder(client, config), /View Channel/);
    assert.equal(payloads.length, 1);
});

test('manual reminder rejects DMs and members without Manage Server before delivery', async () => {
    for (const inGuild of [false, true]) {
        const replies: unknown[] = [];
        const interaction = {
            inGuild: () => inGuild,
            memberPermissions: new PermissionsBitField(),
            reply: async (payload: unknown) => { replies.push(payload); },
        } as unknown as ChatInputCommandInteraction;
        await reminderSend.execute(interaction);
        assert.deepEqual(replies, [{ content: 'You need Manage Server permission to send reminders.', flags: MessageFlags.Ephemeral }]);
    }
});
