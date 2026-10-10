import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { loadReminderConfig } from '../config.js';
import { resolveReminderTarget } from '../reminders/target.js';

export const reminderCheck = {
    data: new SlashCommandBuilder()
        .setName('reminder-check')
        .setDescription('Check the configured Landsraad reminder role and channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'You need Manage Server permission to check reminder settings.', flags: MessageFlags.Ephemeral });
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const config = loadReminderConfig();
            if (interaction.guildId !== config.guildId) {
                await interaction.editReply('Run this command in the configured Selene - Atreides server.');
                return;
            }
            const { role, channel } = await resolveReminderTarget(interaction.client, config);
            await interaction.editReply({
                content: `Reminder target is ready.\nRole: <@&${role.id}>\nChannel: <#${channel.id}>\nNo reminder was sent. Scheduling is not enabled yet.`,
                allowedMentions: { parse: [] },
            });
        } catch (error) {
            console.error('Reminder configuration check failed:', error);
            await interaction.editReply({
                content: `Reminder target is not ready: ${error instanceof Error ? error.message : 'Unknown error'}`,
                allowedMentions: { parse: [] },
            });
        }
    },
};
