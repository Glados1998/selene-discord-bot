import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { loadReminderConfig, loadScheduleConfig } from '../config.js';
import { resolveReminderTarget } from '../reminders/target.js';

/** Checks connectivity and reminder prerequisites without sending a notification. */
export const status = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check bot connectivity, uptime, schedule, and reminder readiness')
        .setDefaultMemberPermissions(0),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        // Acknowledge before REST checks; Discord requires a prompt initial response.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const lines = [
            `Discord connection: ${interaction.client.isReady() ? 'ready' : 'not ready'}`,
            `Process uptime: ${Math.floor(process.uptime() / 60)} minutes`,
            `Gateway latency: ${interaction.client.ws.ping >= 0 ? `${Math.round(interaction.client.ws.ping)} ms` : 'not measured yet'}`,
        ];
        try {
            const schedule = loadScheduleConfig();
            lines.push(schedule
                ? `Configured schedule (Europe/Paris): Friday ${schedule.fridayTime}, Sunday 21:00, Monday ${schedule.mondayTime}`
                : 'Automatic reminders: disabled');
        } catch {
            lines.push('Schedule configuration: invalid');
        }
        try {
            await resolveReminderTarget(interaction.client, loadReminderConfig());
            lines.push('Reminder role, channel, and permissions: ready');
        } catch {
            // Do not expose raw API errors or configuration values in Discord.
            lines.push('Reminder target: check failed; run /reminder-check for details');
        }
        try {
            // Use a unique directory, never a delivery claim, so diagnostics cannot
            // suppress or duplicate a scheduled reminder. Remove it after probing.
            await mkdir('data/reminder-deliveries', { recursive: true });
            const probe = await mkdtemp('data/reminder-deliveries/.health-');
            await rm(probe, { recursive: true });
            lines.push('Reminder storage: writable');
        } catch {
            lines.push('Reminder storage: write check failed');
        }
        lines.push('These checks do not confirm a past or future message delivery.');
        await interaction.editReply({ content: lines.join('\n'), allowedMentions: { parse: [] } });
    },
};
