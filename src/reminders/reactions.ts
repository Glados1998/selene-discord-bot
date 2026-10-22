import type { Message, MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { votingWindow } from './schedule.js';
import { reactionStore, type ReactionStore, type ReminderMessage, type ReminderChoice } from './reaction-store.js';

export const reminderReactions = { voted: '✅', snoozed: '💤' } as const;
export const reactionInstructions = 'React below:\n✅ **I voted** — skip my remaining reminders this cycle.\n💤 **Snooze this cycle** — no more reminders until the next cycle.\nChoose one. To change your choice, remove your selected reaction first, then add the other.';

/** Save ownership before adding reactions so a click can always be attributed safely. */
export async function addReminderReactions(message: Message, binding: ReminderMessage, store: ReactionStore = reactionStore) {
    await store.bind(message.id, binding);
    for (const emoji of Object.values(reminderReactions)) await message.react(emoji);
}

export async function handleReminderReaction(
    reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, guildId: string,
    store: ReactionStore = reactionStore, now: Date = new Date(), action: 'add' | 'remove' = 'add',
): Promise<void> {
    if (user.bot || user.id === reaction.client.user?.id || reaction.message.guildId || reaction.emoji.id) return;
    const choice: ReminderChoice | undefined = reaction.emoji.name === reminderReactions.voted ? 'voted'
        : reaction.emoji.name === reminderReactions.snoozed ? 'snoozed' : undefined;
    if (!choice) return;
    // IDs remain available on partial events after a restart. No message-content parsing or cache trust.
    const reply = (content: string) => user.send({ content, allowedMentions: { parse: [] } });
    await store.withRecipient(guildId, user.id, async () => {
        const binding = await store.message(reaction.message.id);
        if (!binding || binding.guildId !== guildId || binding.userId !== user.id || binding.channelId !== reaction.message.channelId) return;
        const window = votingWindow(now);
        if (now.getTime() >= binding.closes || (!binding.test &&
            (now.getTime() < binding.opens || binding.opens !== window.opens.getTime()))) {
            await reply('This reminder is outside its voting cycle. Your choice was not applied to the current cycle. Please use the latest voting reminder.');
            return;
        }
        // Each preview has its own persistent selection, isolated from real cycle choices.
        const scope = binding.test ? `preview-${guildId}-${reaction.message.id}` : guildId;
        const active = await store.activeChoice(scope, user.id, binding.opens);
        const prefix = binding.test ? 'Test: ' : '';
        const label = (value: ReminderChoice) => value === 'voted' ? '✅ “I voted”' : '💤 “Snooze this cycle”';
        const originalMessage = active?.messageId
            ? `[original reminder](https://discord.com/channels/@me/${binding.channelId}/${active.messageId})`
            : 'reminder where you selected it';
        if (action === 'remove') {
            // Removing a rejected emoji (or a duplicate on another DM) must not clear the accepted choice.
            if (!active || active.choice !== choice || (active.messageId && active.messageId !== reaction.message.id)) return;
            try {
                await store.clearChoice(scope, user.id, binding.opens);
            } catch {
                await reply(`${prefix}I couldn’t clear your choice. It is still saved. Please add that reaction again and remove it to retry.`);
                return;
            }
            await reply(binding.test
                ? `Test: ${label(choice)} cleared. You can now choose the other reaction. Your real reminder settings are unchanged.`
                : `${label(choice)} cleared for this cycle. You can now choose the other reaction. You’re eligible for any remaining scheduled reminders unless you choose again. A reminder whose scheduled time has passed will not be resent.`);
            return;
        }
        if (active && active.choice !== choice) {
            await reply(`${prefix}You can’t choose both reactions. ${label(active.choice)} is still your saved choice. Remove it from the ${originalMessage} first, then add ${label(choice)}. If the rejected reaction is still selected in Discord, remove it and add it again after clearing your saved choice.`);
            return;
        }
        if (active?.messageId && active.messageId !== reaction.message.id) {
            await reply(`${prefix}${label(choice)} is already saved on the ${originalMessage}. To change it, remove your reaction there first.`);
            return;
        }
        try {
            if (!active) await store.saveChoice(scope, user.id, binding.opens, choice, reaction.message.id);
        } catch {
            await reply('I couldn’t save your choice, so your reminders have not been changed. Please remove your reaction and add it again to retry.');
            return;
        }
        if (binding.test) {
            await reply(choice === 'voted'
                ? '✅ Test confirmed: your “I voted” reaction works. On a real reminder, this would skip your remaining reminders for that cycle. Your real reminder settings are unchanged.'
                : '💤 Test confirmed: your snooze reaction works. On a real reminder, this would silence reminders for that cycle. Your real reminder settings are unchanged.');
            return;
        }
        await reply(choice === 'voted'
            ? '✅ Thanks! I’ve recorded that you voted this cycle. You won’t receive any more reminders for this cycle, including Monday’s final reminder. Reminders resume next cycle.'
            : '💤 Reminders snoozed for this cycle. You won’t receive any more reminders for this cycle, including Monday’s final reminder. Reminders resume next cycle.');
    });
}

export async function handleReminderReactionRemoval(
    reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser, guildId: string,
    store: ReactionStore = reactionStore, now: Date = new Date(),
): Promise<void> {
    await handleReminderReaction(reaction, user, guildId, store, now, 'remove');
}
