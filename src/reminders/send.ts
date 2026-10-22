/** Shared manual/scheduled delivery. Text is conditional because game outcomes are not queried. */
import { escapeMarkdown, type Client } from 'discord.js';
import { resolveReminderTarget, type ReminderConfig } from './target.js';
import { displayTime, votingWindow, type ScheduledReminderKind } from './schedule.js';

import { reactionStore, type ReactionStore } from './reaction-store.js';
import { addReminderReactions, reactionInstructions } from './reactions.js';
import { DeliveryStore } from './delivery-store.js';
const deliveryStore = new DeliveryStore('data/reminder-deliveries');

const messages = {
    'voting-open': '**Landsraad voting is now open**\n\nCheck this cycle’s result in Dune: Awakening. If Atreides can vote, please cast your votes for the decrees agreed in our guild discussion.',
    final: '**Landsraad voting closes soon**\n\nIf Atreides can vote this cycle and you haven’t voted yet, please cast your votes for the decrees agreed in our guild discussion before the deadline below. Already voted? You’re all set.',
};

export function buildReminderMessage(displayName: string, kind: ScheduledReminderKind = 'voting-open', now: Date = new Date()) {
    const window = votingWindow(now);
    return {
        content: `Hello ${escapeMarkdown(displayName)},\n\n${messages[kind]}\n\nVoting closes: ${displayTime(window.closes)}\n\n${reactionInstructions}`,
        // Names cannot trigger mentions.
        allowedMentions: { parse: [] as [], roles: [], users: [], repliedUser: false },
    };
}

export async function sendReminder(
    client: Client, config: ReminderConfig, kind: ScheduledReminderKind = 'voting-open',
    now: Date = new Date(), store: Pick<DeliveryStore, 'claim'> = deliveryStore,
    preferences: ReactionStore = reactionStore,
) {
    const window = votingWindow(now);
    if (now < window.opens || now >= window.closes) {
        throw new Error('Voting is outside the scheduled window. Use /reminder-send test:true for a private preview.');
    }
    const { leaders } = await resolveReminderTarget(client, config);
    const deliveryKind = kind;
    const result = { sent: 0, skipped: 0, suppressed: 0, failed: [] as string[], controlsFailed: [] as string[] };
    for (const member of leaders.values()) {
        await preferences.withRecipient(config.guildId, member.id, async () => {
            if (await preferences.choice(config.guildId, member.id, window.opens.getTime())) {
                result.suppressed++;
                return;
            }
            const key = `${config.guildId}-dm-${window.opens.getTime()}-${deliveryKind}-${member.id}`;
            if (!await store.claim(key)) { result.skipped++; return; }
            let message;
            try {
                message = await member.send(buildReminderMessage(member.displayName, deliveryKind, now));
                result.sent++;
            } catch {
                // A rejected or uncertain send remains claimed to avoid duplicate DMs.
                result.failed.push(member.id);
                return;
            }
            try {
                await addReminderReactions(message, {
                    guildId: config.guildId, userId: member.id, channelId: message.channelId,
                    opens: window.opens.getTime(), closes: window.closes.getTime(), test: false,
                }, preferences);
            } catch {
                // The DM was delivered: report setup failure separately, never resend it.
                result.controlsFailed.push(member.id);
            }
        });
    }
    console.log('Landsraad DM delivery:', result);
    return result;
}
