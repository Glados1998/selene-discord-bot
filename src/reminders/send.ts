import type { Client } from 'discord.js';
import { resolveReminderTarget, type ReminderConfig } from './target.js';
import type { ScheduledReminderKind } from './schedule.js';

const messages = {
    manual: 'Please remember to vote on the Landsraad decrees in Dune: Awakening.',
    preparation: 'Let’s prepare for the upcoming Landsraad vote in Dune: Awakening. Start discussing the decrees, or review what we have already discussed and agreed. In-game voting opens on Sunday at 21:00 (Europe/Paris).',
    'voting-open': 'The in-game Landsraad polls are now open in Dune: Awakening! Please cast your votes according to our guild discussion. Voting closes on Tuesday at 06:00 (Europe/Paris).',
    final: 'Final reminder to cast your Landsraad votes in Dune: Awakening! Voting closes tomorrow, Tuesday, at 06:00 (Europe/Paris). Please vote before the deadline.',
};

export function buildReminderMessage(roleId: string, kind: ScheduledReminderKind | 'manual' = 'manual') {
    return {
        content: `<@&${roleId}> ${messages[kind]}`,
        allowedMentions: { parse: [] as [], roles: [roleId], users: [], repliedUser: false },
    };
}

export async function sendReminder(client: Client, config: ReminderConfig, kind: ScheduledReminderKind | 'manual' = 'manual') {
    const { channel, role } = await resolveReminderTarget(client, config);
    return channel.send(buildReminderMessage(role.id, kind));
}
