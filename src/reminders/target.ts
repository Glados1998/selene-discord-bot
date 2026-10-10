import { ChannelType, PermissionFlagsBits, type Client } from 'discord.js';
import type { loadReminderConfig } from '../config.js';

export type ReminderConfig = ReturnType<typeof loadReminderConfig>;

export async function resolveReminderTarget(client: Client, config: ReminderConfig) {
    const guild = await client.guilds.fetch(config.guildId);
    const role = await guild.roles.fetch(config.roleId);
    if (!role || role.id === guild.id) {
        throw new Error('GUILD_LEADER_ROLE_ID must identify an existing role other than @everyone.');
    }

    const channel = await guild.channels.fetch(config.channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
        throw new Error('REMINDER_CHANNEL_ID must identify a text channel in the configured server.');
    }

    const bot = await guild.members.fetchMe();
    const permissions = channel.permissionsFor(bot);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        throw new Error('The bot needs View Channel and Send Messages in the reminder channel.');
    }
    if (!role.mentionable && !permissions.has(PermissionFlagsBits.MentionEveryone)) {
        throw new Error('Make the guild leader role mentionable, or grant the bot Mention Everyone in the reminder channel.');
    }

    return { guild, role, channel };
}
