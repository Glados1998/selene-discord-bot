import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { loadCommandAccessConfig } from '../config.js';

export type CommandAccessConfig = ReturnType<typeof loadCommandAccessConfig>;

export async function authorizeCommand(interaction: ChatInputCommandInteraction, config: CommandAccessConfig): Promise<boolean> {
    if (!interaction.inGuild() || interaction.guildId !== config.guildId) {
        await interaction.reply({ content: 'Commands are only available in the configured server.', flags: MessageFlags.Ephemeral });
        return false;
    }

    const roles = interaction.member?.roles;
    const hasAdminRole = Array.isArray(roles)
        ? roles.includes(config.adminRoleId)
        : roles?.cache.has(config.adminRoleId) === true;
    if (!hasAdminRole) {
        await interaction.reply({ content: 'Only members with the configured admin role can use this bot’s commands.', flags: MessageFlags.Ephemeral });
        return false;
    }
    return true;
}
