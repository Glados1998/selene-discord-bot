import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { loadScheduleConfig } from '../config.js';
import { displayTime, votingWindow, nextPreparation, finalReminder, type ScheduleConfig } from '../reminders/schedule.js';

export function buildScheduleMessage(schedule: ScheduleConfig | undefined, now: Date = new Date()): string {
    const window = votingWindow(now);
    return [
        '**Landsraad voting schedule**',
        'Times are shown in your timezone.',
        '',
        `**Voting opens:** ${displayTime(window.opens)}`,
        `**Voting closes:** ${displayTime(window.closes)}`,
        '',
        ...(schedule ? [
            '**Reminders**',
            `• Next preparation: ${displayTime(nextPreparation(now, schedule.fridayTime))} — discuss our preferred decrees.`,
            `• Voting window reminder: ${displayTime(window.opens)}.`,
            `• Final reminder: ${displayTime(finalReminder(now, schedule.mondayTime))}.`,
        ] : ['Automatic reminders are currently disabled.']),
        '',
        'Check this cycle’s outcome against the Harkonnen in-game. Vote according to our guild discussion if voting is available to us; the Herald does not verify the outcome or whether polls are open.',
    ].join('\n');
}

export const schedule = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Show the weekly voting window and reminder schedule'),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: buildScheduleMessage(loadScheduleConfig()),
            allowedMentions: { parse: [] },
        });
    },
};
