/** Shared manual/scheduled delivery. Text is conditional because game outcomes are not queried. */
import { escapeMarkdown, type Client } from 'discord.js';
import { resolveReminderTarget, type ReminderConfig } from './target.js';
import { displayTime, votingWindow, type ScheduledReminderKind } from './schedule.js';

import { DeliveryStore } from './delivery-store.js';
const deliveryStore = new DeliveryStore('data/reminder-deliveries');

const messages = {
    manual: 'Please check this cycle’s Landsraad outcome in Dune: Awakening. If voting is available to us, remember to vote on the decrees according to our guild discussion.',
    preparation: 'Let’s prepare for the upcoming Landsraad cycle in Dune: Awakening. Start discussing our preferred decrees, or review what we have already discussed and agreed. An Atreides victory is not guaranteed—check the outcome against the Harkonnen before voting.',
    'voting-open': 'The scheduled Landsraad voting window is now open in Dune: Awakening. Check this cycle’s outcome against the Harkonnen. If voting is available to us, please cast your votes according to our guild discussion.',
    final: 'Final Landsraad reminder for Dune: Awakening: if voting is available to us this cycle and you have not voted yet, please do so according to our guild discussion. Check the in-game outcome; an Atreides victory is not assumed.',
};

export function buildReminderMessage(displayName: string, kind: ScheduledReminderKind | 'manual' = 'manual', now: Date = new Date()) {
    const window = votingWindow(now);
    return {
        content: `Hello ${escapeMarkdown(displayName)},\n\n${messages[kind]}\nVoting opens: ${displayTime(window.opens)}\nVoting closes: ${displayTime(window.closes)}`,
        // Names cannot trigger mentions.
        allowedMentions: { parse: [] as [], roles: [], users: [], repliedUser: false },
    };
}

export async function sendReminder(
    client: Client, config: ReminderConfig, kind: ScheduledReminderKind | 'manual' = 'manual',
    now: Date = new Date(), store: Pick<DeliveryStore, 'claim'> = deliveryStore,
) {
    const window = votingWindow(now);
    if (kind !== 'preparation' && (now < window.opens || now >= window.closes)) {
        throw new Error('Voting is outside the scheduled window. Use /reminder-send test:true for a private preview.');
    }
    const { leaders } = await resolveReminderTarget(client, config);
    const deliveryKind = kind === 'manual' ? 'voting-open' : kind;
    const result = { sent: 0, skipped: 0, failed: [] as string[] };
    for (const member of leaders.values()) {
        const key = `${config.guildId}-dm-${window.opens.getTime()}-${deliveryKind}-${member.id}`;
        if (!await store.claim(key)) { result.skipped++; continue; }
        try {
            await member.send(buildReminderMessage(member.displayName, deliveryKind, now));
            result.sent++;
        } catch {
            // A rejected or uncertain send remains claimed to avoid duplicate DMs.
            result.failed.push(member.id);
        }
    }
    console.log('Landsraad DM delivery:', result);
    return result;
}
