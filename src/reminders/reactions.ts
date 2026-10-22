import type { Message, MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { votingWindow } from './schedule.js';
import { reactionStore, type ReactionStore, type ReminderMessage, type ReminderChoice } from './reaction-store.js';

export const reminderReactions = { voted: '✅', snoozed: '💤' } as const;
export const reactionInstructions = 'React below:\n✅ **I voted** — skip my remaining reminders this cycle.\n💤 **Snooze this cycle** — no more reminders until the next cycle.';

/** Save ownership before adding reactions so a click can always be attributed safely. */
export async function addReminderReactions(message: Message, binding: ReminderMessage, store: ReactionStore = reactionStore) {
    await store.bind(message.id, binding);
    for (const emoji of Object.values(reminderReactions)) await message.react(emoji);
}

export async function handleReminderReaction(
    reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, guildId: string,
    store: ReactionStore = reactionStore, now: Date = new Date(),
): Promise<void> {
    if (user.bot || user.id === reaction.client.user?.id || reaction.message.guildId || reaction.emoji.id) return;
    const choice: ReminderChoice | undefined = reaction.emoji.name === reminderReactions.voted ? 'voted'
        : reaction.emoji.name === reminderReactions.snoozed ? 'snoozed' : undefined;
    if (!choice) return;
    // IDs remain available on partial events after a restart. No message-content parsing or cache trust.
    const binding = await store.message(reaction.message.id);
    if (!binding || binding.guildId !== guildId || binding.userId !== user.id || binding.channelId !== reaction.message.channelId) return;
    const reply = (content: string) => user.send({ content, allowedMentions: { parse: [] } });
    await store.withRecipient(guildId, user.id, async () => {
        const window = votingWindow(now);
        if (now.getTime() >= binding.closes || (!binding.test &&
            (now.getTime() < binding.opens || binding.opens !== window.opens.getTime()))) {
            await reply('This reminder is outside its voting cycle. Your choice was not applied to the current cycle. Please use the latest voting reminder.');
            return;
        }
        if (binding.test) {
            await reply(choice === 'voted'
                ? '✅ Test confirmed: your “I voted” reaction works. On a real reminder, this would skip your remaining reminders for that cycle. Your real reminder settings are unchanged.'
                : '💤 Test confirmed: your snooze reaction works. On a real reminder, this would silence reminders for that cycle. Your real reminder settings are unchanged.');
            return;
        }
        try {
            await store.saveChoice(guildId, user.id, binding.opens, choice);
        } catch {
            await reply('I couldn’t save your choice, so your reminders have not been changed. Please remove your reaction and add it again to retry.');
            return;
        }
        await reply(choice === 'voted'
            ? '✅ Thanks! I’ve recorded that you voted this cycle. You won’t receive any more reminders for this cycle, including Monday’s final reminder. Reminders resume next cycle.'
            : '💤 Reminders snoozed for this cycle. You won’t receive any more reminders for this cycle, including Monday’s final reminder. Reminders resume next cycle.');
    });
}
