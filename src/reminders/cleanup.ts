/** Delete only tracked, bot-authored DMs from cycles that have closed. */
import { ChannelType, type Client } from 'discord.js';
import { latestCycleClosing } from './schedule.js';
import { reactionStore, type ReactionStore } from './reaction-store.js';

export async function cleanupPreviousCycles(
    client: Client, guildId: string, now: Date = new Date(), store: ReactionStore = reactionStore,
) {
    if (!client.user) throw new Error('DM cleanup requires a connected bot.');
    const botId = client.user.id;
    const cutoff = latestCycleClosing(now).getTime();
    const result = { deleted: 0, alreadyDeleted: 0, failed: [] as string[] };
    for (const messageId of await store.messageIds()) {
        try {
            const candidate = await store.message(messageId);
            if (!candidate || candidate.guildId !== guildId || candidate.closes > cutoff) continue;
            await store.withRecipient(guildId, candidate.userId, async () => {
                const binding = await store.message(messageId);
                if (!binding || binding.guildId !== guildId || binding.closes > cutoff) return;
                const channel = await client.channels.fetch(binding.channelId);
                if (!channel || channel.type !== ChannelType.DM || channel.recipientId !== binding.userId) {
                    throw new Error('Tracked reminder does not match its recipient DM.');
                }
                try {
                    const message = await channel.messages.fetch(messageId);
                    if (message.author.id !== botId) throw new Error('Tracked message was not authored by this bot.');
                    await message.delete();
                    result.deleted++;
                } catch (error) {
                    // Unknown Message means it was already deleted, including a prior uncertain delete.
                    if ((error as { code?: number }).code !== 10008) throw error;
                    result.alreadyDeleted++;
                }
                // Keep delivery claims and cycle choices intact; cleanup cannot cause a resend.
                await store.forgetMessage(messageId);
            });
        } catch {
            result.failed.push(messageId);
        }
    }
    return result;
}

/** Called by the serial scheduler. Cycle closings run immediately; failures retry hourly. */
export function createCycleCleanup(client: Client, guildId: string, store: ReactionStore = reactionStore) {
    let checkedCycle: number | undefined;
    let nextCheck = 0;
    return async (now: Date) => {
        const cycle = latestCycleClosing(now).getTime();
        if (cycle === checkedCycle && now.getTime() < nextCheck) return;
        checkedCycle = cycle;
        nextCheck = now.getTime() + 60 * 60 * 1000;
        const result = await cleanupPreviousCycles(client, guildId, now, store);
        if (result.deleted || result.alreadyDeleted || result.failed.length) {
            console.log('Closed-cycle DM cleanup:', result);
        }
    };
}
