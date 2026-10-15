import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { loadScheduleConfig } from '../config.js';
import { REMINDER_TIME_ZONE, type ScheduleConfig } from '../reminders/schedule.js';

export function buildScheduleMessage(schedule: ScheduleConfig | undefined): string {
    return [
        '**Landsraad voting schedule**',
        `All times are in **${REMINDER_TIME_ZONE}** (including daylight saving changes).`,
        '',
        '**Voting opens:** Sunday at 21:00',
        '**Voting closes:** Tuesday at 06:00',
        '',
        ...(schedule ? [
            '**Weekly reminders**',
            `• Friday at ${schedule.fridayTime} — prepare and discuss our preferred decrees.`,
            '• Sunday at 21:00 — voting window reminder.',
            `• Monday at ${schedule.mondayTime} — final reminder before voting closes.`,
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
            content: buildScheduleMessage(loadScheduleConfig()),
            allowedMentions: { parse: [] },
        });
    },
};
