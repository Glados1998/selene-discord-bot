import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayIntentBits, Partials, type MessageReaction, type User } from 'discord.js';
import { createBot } from '../src/bot.js';
import { ReactionStore, type ReminderMessage } from '../src/reminders/reaction-store.js';
import { handleReminderReaction, handleReminderReactionRemoval } from '../src/reminders/reactions.js';
import { sendReminder } from '../src/reminders/send.js';
import { config, fixture } from './reminder-fixture.js';

const opens = new Date('2026-10-18T19:00:00Z');
const closes = new Date('2026-10-20T04:00:00Z');
const monday = new Date('2026-10-19T18:00:00Z');
const next = new Date('2026-10-25T20:00:00Z');
const binding: ReminderMessage = {
    guildId: config.guildId, userId: 'leader', channelId: 'dm-leader',
    opens: opens.getTime(), closes: closes.getTime(), test: false,
};
async function setup(context: TestContext) {
    const directory = await mkdtemp(join(tmpdir(), 'selene-reactions-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    return { directory, store: new ReactionStore(directory) };
}
function event(emoji = '✅') {
    const replies: { content: string; allowedMentions: { parse: string[] } }[] = [];
    const reaction = {
        partial: true, client: { user: { id: 'bot' } }, emoji: { name: emoji, id: null },
        message: { id: 'message-1', channelId: 'dm-leader', guildId: null, partial: true },
    };
    const user = { id: 'leader', partial: true, bot: false, send: async (reply: typeof replies[number]) => { replies.push(reply); } };
    return { reaction, user, replies };
}
async function react(value: ReturnType<typeof event>, store: ReactionStore, now = opens) {
    await handleReminderReaction(value.reaction as unknown as MessageReaction, value.user as unknown as User, config.guildId, store, now);
}
async function remove(value: ReturnType<typeof event>, store: ReactionStore, now = opens) {
    await handleReminderReactionRemoval(value.reaction as unknown as MessageReaction, value.user as unknown as User, config.guildId, store, now);
}
function claims() {
    const keys = new Set<string>();
    return { claim: async (key: string) => { if (keys.has(key)) return false; keys.add(key); return true; } };
}

for (const [emoji, choice, acknowledgement] of [['✅', 'voted', /recorded that you voted/], ['💤', 'snoozed', /Reminders snoozed/]] as const) {
    test(`${choice}: persist acknowledgement, skip Monday, and resume next cycle`, async context => {
        const { directory, store } = await setup(context);
        const f = fixture(); f.members.delete('blocked');
        const deliveryClaims = claims();
        const first = await sendReminder(f.client, config, 'voting-open', opens, deliveryClaims, store);
        assert.equal(first.sent, 1);
        assert.deepEqual(f.reactions, ['✅', '💤']);
        assert.deepEqual(await store.message('message-1'), binding);
        const e = event(emoji);
        // Partial event and a fresh store simulate a reaction to a pre-restart DM.
        await react(e, new ReactionStore(directory));
        assert.match(e.replies[0]!.content, acknowledgement);
        assert.deepEqual(e.replies[0]!.allowedMentions, { parse: [] });
        assert.equal(await new ReactionStore(directory).choice(config.guildId, 'leader', opens.getTime()), choice);
        const final = await sendReminder(f.client, config, 'final', monday, deliveryClaims, new ReactionStore(directory));
        assert.equal(final.suppressed, 1);
        assert.equal(final.sent, 0);
        assert.equal(f.payloads.length, 1);
        const subsequent = await sendReminder(f.client, config, 'voting-open', next, deliveryClaims, store);
        assert.equal(subsequent.sent, 1);
        await react(e, store, next);
        assert.match(e.replies.at(-1)!.content, /outside its voting cycle/);
        assert.equal(await store.choice(config.guildId, 'leader', next.getTime()), undefined);
    });
}

test('only the bound recipient can act on a tracked DM in the configured guild', async context => {
    const { store } = await setup(context);
    await store.bind('message-1', binding);
    for (const change of [
        (e: ReturnType<typeof event>) => { e.user.id = 'someone-else'; },
        (e: ReturnType<typeof event>) => { e.user.bot = true; },
        (e: ReturnType<typeof event>) => { e.reaction.message.id = 'untracked'; },
        (e: ReturnType<typeof event>) => { e.reaction.message.channelId = 'other-dm'; },
        (e: ReturnType<typeof event>) => { e.reaction.emoji.name = '👍'; },
        (e: ReturnType<typeof event>) => { Object.assign(e.reaction.emoji, { id: 'custom-emoji' }); },
        (e: ReturnType<typeof event>) => { Object.assign(e.reaction.message, { guildId: config.guildId }); },
    ]) {
        const e = event(); change(e); await react(e, store); assert.equal(e.replies.length, 0);
    }
    await store.bind('message-1', { ...binding, guildId: 'other-guild' });
    const e = event(); await react(e, store); assert.equal(e.replies.length, 0);
    assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), undefined);
});

test('real reactions are valid from opening up to, but not including, closing', async context => {
    const { store } = await setup(context);
    await store.bind('message-1', binding);
    for (const now of [new Date(opens.getTime() - 1), closes]) {
        const e = event(); await react(e, store, now);
        assert.match(e.replies[0]!.content, /outside its voting cycle/);
        assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), undefined);
    }
    const e = event(); await react(e, store, new Date(closes.getTime() - 1));
    assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), 'voted');
});

test('test reactions work outside voting hours without suppressing real reminders', async context => {
    const { store } = await setup(context);
    await store.bind('message-1', { ...binding, test: true });
    for (const emoji of ['✅', '💤']) {
        const e = event(emoji); await react(e, store, new Date('2026-10-16T12:00:00Z'));
        assert.match(e.replies[0]!.content, /Test confirmed/);
        assert.match(e.replies[0]!.content, /real reminder settings are unchanged/);
        await remove(e, store, new Date('2026-10-16T12:00:00Z'));
        assert.match(e.replies.at(-1)!.content, /cleared/);
        assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), undefined);
    }
    const e = event(); await react(e, store, closes);
    assert.match(e.replies[0]!.content, /outside its voting cycle/);
});

test('failed save never acknowledges success; failed acknowledgement preserves the choice', async context => {
    const { store, directory } = await setup(context);
    await store.bind('message-1', binding);
    const failure = context.mock.method(store, 'saveChoice', async () => { throw new Error('disk failure'); });
    const e = event(); await react(e, store);
    assert.match(e.replies[0]!.content, /couldn’t save/);
    assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), undefined);
    failure.mock.restore();
    e.user.send = async () => { throw new Error('DM acknowledgement failed'); };
    await assert.rejects(react(e, store), /acknowledgement failed/);
    assert.equal(await new ReactionStore(directory).choice(config.guildId, 'leader', opens.getTime()), 'voted');
    const retry = event(); await react(retry, store);
    assert.match(retry.replies[0]!.content, /recorded that you voted/);
});

test('a choice being saved takes effect before a queued final send', async context => {
    const { store } = await setup(context);
    const f = fixture(); f.members.delete('blocked');
    const saving = store.withRecipient(config.guildId, 'leader', async () => {
        await store.saveChoice(config.guildId, 'leader', opens.getTime(), 'snoozed');
    });
    const final = sendReminder(f.client, config, 'final', monday, claims(), store);
    await saving;
    assert.equal((await final).suppressed, 1);
    assert.equal(f.payloads.length, 0);
});

test('reaction setup failures do not misreport or repeat a delivered DM', async context => {
    const { store } = await setup(context);
    const f = fixture(); f.members.delete('blocked');
    context.mock.method(store, 'bind', async () => { throw new Error('cannot persist message'); });
    const deliveryClaims = claims();
    const result = await sendReminder(f.client, config, 'voting-open', opens, deliveryClaims, store);
    assert.equal(result.sent, 1);
    assert.deepEqual(result.failed, []);
    assert.deepEqual(result.controlsFailed, ['leader']);
    await sendReminder(f.client, config, 'voting-open', opens, deliveryClaims, store);
    assert.equal(f.payloads.length, 1);
});

test('client accepts uncached DM reactions after a restart', async () => {
    const client = createBot({ guildId: config.guildId, adminRoleId: 'admin' });
    try {
        assert.ok(client.options.intents.has(GatewayIntentBits.DirectMessageReactions));
        for (const partial of [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User]) {
            assert.ok(client.options.partials.includes(partial));
        }
    } finally { await client.destroy(); }
});


for (const [firstEmoji, firstChoice, secondEmoji, secondChoice] of [
    ['✅', 'voted', '💤', 'snoozed'], ['💤', 'snoozed', '✅', 'voted'],
] as const) {
    test(`${firstChoice} must be removed before switching to ${secondChoice}, including after restart`, async context => {
        const { store, directory } = await setup(context);
        await store.bind('message-1', binding);
        const first = event(firstEmoji); const second = event(secondEmoji);
        await react(first, store);
        const restarted = new ReactionStore(directory);
        await react(second, restarted);
        assert.match(second.replies[0]!.content, /can’t choose both/);
        assert.equal(await restarted.choice(config.guildId, 'leader', opens.getTime()), firstChoice);
        // A rejected reaction never becomes active, even when removed later.
        await remove(second, restarted);
        assert.equal(await restarted.choice(config.guildId, 'leader', opens.getTime()), firstChoice);
        await remove(first, restarted);
        assert.match(first.replies.at(-1)!.content, /cleared for this cycle/);
        assert.equal(await new ReactionStore(directory).choice(config.guildId, 'leader', opens.getTime()), undefined);
        await react(second, restarted);
        assert.equal(await restarted.choice(config.guildId, 'leader', opens.getTime()), secondChoice);
        await remove(first, restarted);
        assert.equal(await restarted.choice(config.guildId, 'leader', opens.getTime()), secondChoice);
    });

    test(`preview enforces ${firstChoice} to ${secondChoice} correction without changing live state`, async context => {
        const { store } = await setup(context);
        await store.bind('message-1', { ...binding, test: true });
        const first = event(firstEmoji); const second = event(secondEmoji);
        await react(first, store);
        await react(second, store);
        assert.match(second.replies[0]!.content, /Test: You can’t choose both/);
        await remove(first, store);
        await react(second, store);
        assert.match(second.replies.at(-1)!.content, /Test confirmed/);
        assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), undefined);
    });
}

test('rapid remove then add is processed in event order', async context => {
    const { store } = await setup(context);
    await store.bind('message-1', binding);
    const voted = event(); const snoozed = event('💤');
    await react(voted, store);
    await Promise.all([remove(voted, store), react(snoozed, store)]);
    assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), 'snoozed');
    assert.match(snoozed.replies[0]!.content, /Reminders snoozed/);
});

test('simultaneous opposite choices accept one and reject the other', async context => {
    const { store } = await setup(context);
    await store.bind('message-1', binding);
    const voted = event(); const snoozed = event('💤');
    await Promise.all([react(voted, store), react(snoozed, store)]);
    assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), 'voted');
    assert.match(snoozed.replies[0]!.content, /can’t choose both/);
});

test('removing a duplicate on a different message does not clear the original selection', async context => {
    const { store } = await setup(context);
    await store.bind('message-1', binding);
    await store.bind('message-2', binding);
    const original = event(); const duplicate = event(); duplicate.reaction.message.id = 'message-2';
    await react(original, store);
    await react(duplicate, store);
    assert.match(duplicate.replies[0]!.content, /already saved/);
    await remove(duplicate, store);
    assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), 'voted');
    await remove(original, store);
    assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), undefined);
});

test('clearing a choice re-enables an unsent final reminder and failures preserve the choice', async context => {
    const { store } = await setup(context);
    await store.bind('message-1', binding);
    const e = event(); await react(e, store);
    const failure = context.mock.method(store, 'clearChoice', async () => { throw new Error('disk failure'); });
    await remove(e, store);
    assert.match(e.replies.at(-1)!.content, /couldn’t clear/);
    assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), 'voted');
    failure.mock.restore();
    await remove(e, store);
    const f = fixture(); f.members.delete('blocked');
    assert.equal((await sendReminder(f.client, config, 'final', monday, claims(), store)).sent, 1);
});

test('expired or unauthorized removal cannot clear the active choice', async context => {
    const { store } = await setup(context);
    await store.bind('message-1', binding);
    const e = event(); await react(e, store);
    await remove(e, store, closes);
    assert.match(e.replies.at(-1)!.content, /outside its voting cycle/);
    const other = event(); other.user.id = 'someone-else';
    await remove(other, store);
    assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), 'voted');
});

test('clearing a migrated choice does not reactivate a second legacy flag', async context => {
    const { store, directory } = await setup(context);
    await mkdir(join(directory, 'choices'));
    for (const choice of ['voted', 'snoozed']) {
        await writeFile(join(directory, 'choices', `${config.guildId}-leader-${opens.getTime()}-${choice}.json`), '{}');
    }
    await store.bind('message-1', binding);
    assert.equal(await store.choice(config.guildId, 'leader', opens.getTime()), 'voted');
    await remove(event(), store);
    const restarted = new ReactionStore(directory);
    assert.equal(await restarted.choice(config.guildId, 'leader', opens.getTime()), undefined);
    await react(event('💤'), restarted);
    assert.equal(await restarted.choice(config.guildId, 'leader', opens.getTime()), 'snoozed');
});
