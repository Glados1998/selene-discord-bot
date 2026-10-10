import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { loadReminderConfig } from '../config.js';
import { sendReminder } from '../reminders/send.js';

// Prevent concurrent manual requests from producing duplicate role notifications.
const activeGuilds = new Set<string>();

export const reminderSend = {
    data: new SlashCommandBuilder()
        .setName('reminder-send')
        .setDescription('Send a Landsraad voting reminder and notify the guild leader role')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'You need Manage Server permission to send reminders.', flags: MessageFlags.Ephemeral });
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const guildId = interaction.guildId;
        if (activeGuilds.has(guildId)) {
            await interaction.editReply('A reminder is already being sent.');
            return;
        }
        activeGuilds.add(guildId);
        try {
            const config = loadReminderConfig();
            if (guildId !== config.guildId) {
                await interaction.editReply('Run this command in the configured Selene - Atreides server.');
                return;
            }
            let message;
            try {
                message = await sendReminder(interaction.client, config);
            } catch (error) {
                console.error('Reminder delivery failed:', error);
                await interaction.editReply('Could not confirm reminder delivery. Check the reminder channel before retrying, and use /reminder-check to verify settings.');
                return;
            }
            // Keep confirmation failures separate: delivery has already succeeded.
            await interaction.editReply({ content: `Reminder sent: ${message.url}`, allowedMentions: { parse: [] } });
        } catch (error) {
            console.error('Manual reminder command failed:', error);
            await interaction.editReply('The command could not finish. Check the reminder channel before retrying and run /reminder-check to verify configuration.');
        } finally {
            activeGuilds.delete(guildId);
        }
    },
};
