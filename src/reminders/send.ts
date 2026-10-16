/** Shared manual/scheduled delivery. Text is conditional because game outcomes are not queried. */
import type { Client } from 'discord.js';
import { resolveReminderTarget, type ReminderConfig } from './target.js';
import { displayTime, votingWindow, type ScheduledReminderKind } from './schedule.js';

const messages = {
    manual: 'Please check this cycle’s Landsraad outcome in Dune: Awakening. If voting is available to us, remember to vote on the decrees according to our guild discussion.',
    preparation: 'Let’s prepare for the upcoming Landsraad cycle in Dune: Awakening. Start discussing our preferred decrees, or review what we have already discussed and agreed. An Atreides victory is not guaranteed—check the outcome against the Harkonnen before voting.',
    'voting-open': 'The scheduled Landsraad voting window is now open in Dune: Awakening. Check this cycle’s outcome against the Harkonnen. If voting is available to us, please cast your votes according to our guild discussion.',
    final: 'Final Landsraad reminder for Dune: Awakening: if voting is available to us this cycle and you have not voted yet, please do so according to our guild discussion. Check the in-game outcome; an Atreides victory is not assumed.',
};

export function buildReminderMessage(roleId: string, kind: ScheduledReminderKind | 'manual' = 'manual', now: Date = new Date()) {
    const window = votingWindow(now);
    return {
        content: `<@&${roleId}> ${messages[kind]}\nVoting opens: ${displayTime(window.opens)}\nVoting closes: ${displayTime(window.closes)}`,
        // Explicit allowlist prevents @everyone, user, or unrelated role notifications.
        allowedMentions: { parse: [] as [], roles: [roleId], users: [], repliedUser: false },
    };
}

export async function sendReminder(client: Client, config: ReminderConfig, kind: ScheduledReminderKind | 'manual' = 'manual') {
    const { channel, role } = await resolveReminderTarget(client, config);
    return channel.send(buildReminderMessage(role.id, kind));
}
