/** Manual delivery after central authorization; the guild lock only prevents concurrent sends. */
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { loadReminderConfig } from '../config.js';
import { addReminderReactions } from '../reminders/reactions.js';
import { votingWindow } from '../reminders/schedule.js';
import { buildReminderMessage, sendReminder } from '../reminders/send.js';

// Prevent concurrent manual requests from producing overlapping deliveries.
const activeGuilds = new Set<string>();

export const reminderSend = {
    data: new SlashCommandBuilder()
        .setName('reminder-send')
        .setDescription('DM guild leaders about the current Landsraad voting window')
        .addStringOption(option => option.setName('kind').setDescription('Which reminder to send or preview (default: voting open)')
            .addChoices({ name: 'Voting open', value: 'voting-open' }, { name: 'Closing soon', value: 'final' }))
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
            const kind = interaction.options.getString('kind') === 'final' ? 'final' : 'voting-open';
            if (interaction.options.getBoolean('test') === true) {
                const payload = buildReminderMessage(interaction.user.displayName, kind);
                payload.content = `**TEST PREVIEW — this does not confirm voting is open.**\n${payload.content}`;
                try {
                    const message = await interaction.user.send(payload);
                    const window = votingWindow();
                    try {
                        await addReminderReactions(message, {
                            guildId, userId: interaction.user.id, channelId: message.channelId,
                            opens: window.opens.getTime(), closes: window.closes.getTime(), test: true,
                        });
                    } catch {
                        await interaction.editReply('Test DM sent, but its reactions could not be set up. Check the bot storage and connection before retrying.');
                        return;
                    }
                    await interaction.editReply('Test DM sent only to you. Try ✅ or 💤 in the DM; test reactions do not change your real reminder settings. No cycle delivery was recorded.');
                } catch {
                    await interaction.editReply('Could not confirm your test DM. Check your DMs and server privacy settings.');
                }
                return;
            }
            let message;
            try {
                message = await sendReminder(interaction.client, config, kind);
            } catch (error) {
                console.error('Reminder delivery failed:', error);
                await interaction.editReply('Could not confirm reminder delivery. Voting must be within its scheduled window. Use /reminder-check to verify the leader roster, or /reminder-send test:true for a preview.');
                return;
            }
            // Keep confirmation failures separate: delivery has already succeeded.
            await interaction.editReply({ content: `Leader DMs: ${message.sent} sent, ${message.skipped} already attempted this cycle, ${message.suppressed} skipped because they voted or snoozed, ${message.failed.length} failed or uncertain. ${message.controlsFailed.length} delivered DMs had reaction setup problems. Failed attempts are not retried automatically.${(message.failed.length || message.controlsFailed.length) ? " Check the server logs for recipient IDs." : ""}`, allowedMentions: { parse: [] } });
        } catch (error) {
            console.error('Manual reminder command failed:', error);
            await interaction.editReply('The command could not finish. Check server logs and DM delivery results before retrying and run /reminder-check to verify configuration.');
        } finally {
            activeGuilds.delete(guildId);
        }
    },
};
