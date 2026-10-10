/** Private setup diagnostics; invoked only after the central admin-role check. */
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { loadReminderConfig, loadScheduleConfig } from '../config.js';
import { resolveReminderTarget } from '../reminders/target.js';

export const reminderCheck = {
    data: new SlashCommandBuilder()
        .setName('reminder-check')
        .setDescription('Check the configured Landsraad reminder role and channel')
        .setDefaultMemberPermissions(0),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const config = loadReminderConfig();
            if (interaction.guildId !== config.guildId) {
                await interaction.editReply('Run this command in the configured Selene - Atreides server.');
                return;
            }
            const { role, channel } = await resolveReminderTarget(interaction.client, config);
            const schedule = loadScheduleConfig();
            const scheduleStatus = schedule
                ? `Weekly schedule (Europe/Paris): Friday ${schedule.fridayTime}, Sunday 21:00, Monday ${schedule.mondayTime}. Voting closes Tuesday 06:00. The bot must remain running.`
                : 'Automatic reminders are disabled.';
            await interaction.editReply({
                content: `Reminder target is ready.\nRole: <@&${role.id}>\nChannel: <#${channel.id}>\n${scheduleStatus}\nNo reminder was sent by this check.`,
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
