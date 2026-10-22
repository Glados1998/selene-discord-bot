/** Fetch the complete guild roster; cached role members may be incomplete. */
import type { Client } from 'discord.js';
import type { loadReminderConfig } from '../config.js';

export type ReminderConfig = ReturnType<typeof loadReminderConfig>;

export async function resolveReminderTarget(client: Client, config: ReminderConfig) {
    const guild = await client.guilds.fetch(config.guildId);
    const role = await guild.roles.fetch(config.roleId);
    if (!role || role.id === guild.id) {
        throw new Error('GUILD_LEADER_ROLE_ID must identify an existing role other than @everyone.');
    }
    const members = await guild.members.fetch();
    const leaders = members.filter(member => !member.user.bot && member.roles.cache.has(role.id));
    if (!leaders.size) throw new Error('No human members have the configured guild leader role.');
    return { guild, role, leaders };
}
