/** Manual delivery after central authorization; the guild lock only prevents concurrent sends. */
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { loadReminderConfig } from '../config.js';
import { buildReminderMessage, sendReminder } from '../reminders/send.js';

// Prevent concurrent manual requests from producing overlapping deliveries.
const activeGuilds = new Set<string>();

export const reminderSend = {
    data: new SlashCommandBuilder()
        .setName('reminder-send')
        .setDescription('DM guild leaders about the current Landsraad voting window')
        .addBooleanOption(option => option.setName('test').setDescription('Send a labelled preview only to yourself, at any time'))
        .setDefaultMemberPermissions(0),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const guildId = interaction.guildId!;
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
            if (interaction.options.getBoolean('test') === true) {
                const payload = buildReminderMessage(interaction.user.displayName, 'voting-open');
                payload.content = `**TEST PREVIEW — this does not confirm voting is open.**\n${payload.content}`;
                try {
                    await interaction.user.send(payload);
                    await interaction.editReply('Test DM sent only to you. No cycle delivery was recorded.');
                } catch {
                    await interaction.editReply('Could not confirm your test DM. Check your DMs and server privacy settings.');
                }
                return;
            }
            let message;
            try {
                message = await sendReminder(interaction.client, config);
            } catch (error) {
                console.error('Reminder delivery failed:', error);
                await interaction.editReply('Could not confirm reminder delivery. Voting must be within its scheduled window. Use /reminder-check to verify the leader roster, or /reminder-send test:true for a preview.');
                return;
            }
            // Keep confirmation failures separate: delivery has already succeeded.
            await interaction.editReply({ content: `Leader DMs: ${message.sent} sent, ${message.skipped} already attempted this cycle, ${message.failed.length} failed or uncertain. Failed attempts are not retried automatically.${message.failed.length ? " Check the server logs for recipient IDs." : ""}`, allowedMentions: { parse: [] } });
        } catch (error) {
            console.error('Manual reminder command failed:', error);
            await interaction.editReply('The command could not finish. Check server logs and DM delivery results before retrying and run /reminder-check to verify configuration.');
        } finally {
            activeGuilds.delete(guildId);
        }
    },
};
