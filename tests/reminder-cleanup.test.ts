import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChannelType, type Client } from 'discord.js';
import { latestCycleClosing } from '../src/reminders/schedule.js';
import { ReactionStore, type ReminderMessage } from '../src/reminders/reaction-store.js';
import { cleanupPreviousCycles, createCycleCleanup } from '../src/reminders/cleanup.js';
import { createScheduler } from '../src/reminders/scheduler.js';
import { DeliveryStore } from '../src/reminders/delivery-store.js';

const guildId = 'guild';
const opening = new Date('2026-10-25T20:00:00Z');
const previous: ReminderMessage = {
    guildId, userId: 'leader', channelId: 'dm-leader', test: false,
    opens: new Date('2026-10-18T19:00:00Z').getTime(), closes: new Date('2026-10-20T04:00:00Z').getTime(),
};
const current: ReminderMessage = { ...previous, opens: opening.getTime(), closes: new Date('2026-10-27T05:00:00Z').getTime() };
async function setup(context: TestContext) {
    const directory = await mkdtemp(join(tmpdir(), 'selene-cleanup-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const records = new Map<string, { authorId: string; error?: number }>();
    const deleted: string[] = [];
    const fetched: string[] = [];
    const channel = {
        type: ChannelType.DM, recipientId: 'leader', messages: { fetch: async (id: string) => {
            fetched.push(id);
            const record = records.get(id);
            if (!record) throw Object.assign(new Error('Unknown message'), { code: 10008 });
            return { author: { id: record.authorId }, delete: async () => {
                if (record.error) throw Object.assign(new Error('API failure'), { code: record.error });
                deleted.push(id); records.delete(id);
            } };
        } },
    };
    const client = { user: { id: 'bot' }, channels: { fetch: async () => channel } } as unknown as Client;
    return { directory, store: new ReactionStore(directory), client, channel, records, fetched, deleted };
}

test('cleanup cutoff is Tuesday 06:00, including exact boundaries, DST and year changes', () => {
    for (const [now, expected] of [
        ['2026-10-20T03:59:59Z', '2026-10-13T04:00:00Z'],
        ['2026-10-20T04:00:00Z', '2026-10-20T04:00:00Z'],
        ['2026-10-25T20:00:00Z', '2026-10-20T04:00:00Z'],
        ['2026-10-27T04:59:59Z', '2026-10-20T04:00:00Z'],
        ['2026-10-27T05:00:00Z', '2026-10-27T05:00:00Z'],
        ['2026-03-31T03:59:59Z', '2026-03-24T05:00:00Z'],
        ['2026-03-31T04:00:00Z', '2026-03-31T04:00:00Z'],
        ['2027-01-01T12:00:00Z', '2026-12-29T05:00:00Z'],
    ]) assert.equal(latestCycleClosing(new Date(now!)).getTime(), new Date(expected!).getTime());
});

test('closing removes that cycle’s DMs and replies while preserving future messages, other guilds, and state', async context => {
    const f = await setup(context);
    for (const [id, binding] of [
        ['old-reminder', previous], ['old-reply', { ...previous, reactable: false }],
        ['old-preview', { ...previous, test: true }], ['current', current],
        ['other-guild', { ...previous, guildId: 'another' }],
    ] as const) { await f.store.bind(id, binding); f.records.set(id, { authorId: 'bot' }); }
    f.records.set('untracked', { authorId: 'bot' });
    await f.store.saveChoice(guildId, 'leader', current.opens, 'voted');
    const deliveries = new DeliveryStore(join(f.directory, 'deliveries'));
    await deliveries.claim('current-opening');
    assert.equal((await cleanupPreviousCycles(f.client, guildId, new Date(previous.closes - 1), f.store)).deleted, 0);
    const result = await cleanupPreviousCycles(f.client, guildId, new Date(previous.closes), f.store);
    assert.equal(result.deleted, 3); assert.deepEqual(result.failed, []);
    assert.deepEqual(f.deleted.sort(), ['old-preview', 'old-reminder', 'old-reply']);
    assert.deepEqual((await f.store.messageIds()).sort(), ['current', 'other-guild']);
    assert.equal(f.records.has('untracked'), true);
    assert.equal(await f.store.choice(guildId, 'leader', current.opens), 'voted');
    assert.equal(await deliveries.claim('current-opening'), false);
});

test('startup catches up missed cycles and already-deleted messages are retired idempotently', async context => {
    const f = await setup(context);
    await f.store.bind('old', previous); await f.store.bind('gone', previous);
    f.records.set('old', { authorId: 'bot' });
    const fresh = new ReactionStore(f.directory);
    const result = await cleanupPreviousCycles(f.client, guildId, new Date('2026-11-03T12:00:00Z'), fresh);
    assert.equal(result.deleted, 1); assert.equal(result.alreadyDeleted, 1);
    assert.deepEqual(result.failed, []);
    assert.deepEqual(await fresh.messageIds(), []);
    await cleanupPreviousCycles(f.client, guildId, new Date('2026-11-03T12:00:00Z'), fresh);
    assert.equal(f.fetched.length, 2);
});

test('failed deletions remain tracked and do not stop cleanup of other recipients/messages', async context => {
    const f = await setup(context);
    await f.store.bind('a-failing', previous); await f.store.bind('b-ok', previous);
    f.records.set('a-failing', { authorId: 'bot', error: 50013 }); f.records.set('b-ok', { authorId: 'bot' });
    const result = await cleanupPreviousCycles(f.client, guildId, new Date(previous.closes), f.store);
    assert.deepEqual(result.failed, ['a-failing']); assert.equal(result.deleted, 1);
    assert.deepEqual(await f.store.messageIds(), ['a-failing']);
    f.records.set('a-failing', { authorId: 'bot' });
    assert.equal((await cleanupPreviousCycles(f.client, guildId, opening, new ReactionStore(f.directory))).deleted, 1);
});

test('cleanup refuses user-authored messages, wrong recipients, and server channels', async context => {
    const f = await setup(context);
    await f.store.bind('message', previous); f.records.set('message', { authorId: 'leader' });
    assert.deepEqual((await cleanupPreviousCycles(f.client, guildId, opening, f.store)).failed, ['message']);
    f.records.set('message', { authorId: 'bot' }); f.channel.recipientId = 'different-user';
    assert.deepEqual((await cleanupPreviousCycles(f.client, guildId, opening, f.store)).failed, ['message']);
    f.channel.recipientId = 'leader'; f.channel.type = ChannelType.GuildText;
    assert.deepEqual((await cleanupPreviousCycles(f.client, guildId, opening, f.store)).failed, ['message']);
    assert.equal(f.deleted.length, 0);
    assert.ok(await f.store.message('message'));
});

test('cleanup throttles retries but the closing instant runs immediately', async context => {
    context.mock.method(console, 'log', () => {});
    const f = await setup(context);
    await f.store.bind('old', previous); f.records.set('old', { authorId: 'bot', error: 50013 });
    const cleanup = createCycleCleanup(f.client, guildId, f.store);
    await cleanup(opening);
    await cleanup(new Date(opening.getTime() + 30_000));
    assert.equal(f.fetched.length, 1);
    await cleanup(new Date(opening.getTime() + 60 * 60 * 1000));
    assert.equal(f.fetched.length, 2);
    // A scan just before Tuesday closing must not postpone cleanup of the ending cycle.
    await f.store.bind('current', current); f.records.set('current', { authorId: 'bot' });
    await cleanup(new Date('2026-10-27T04:59:59Z'));
    assert.equal(f.records.has('current'), true);
    await cleanup(new Date('2026-10-27T05:00:00Z'));
    assert.equal(f.records.has('current'), false);
});

test('scheduler cleans before sending, remains serial, and cleans with reminders disabled', async () => {
    const order: string[] = [];
    let ready = false;
    const options = {
        guildId, isReady: () => ready, now: () => opening,
        cleanup: async () => { order.push('cleanup'); },
        claim: async () => true, send: async () => { order.push('send'); },
    };
    const scheduler = createScheduler({ ...options, schedule: { mondayTime: '20:00' } });
    await scheduler.tick(); assert.deepEqual(order, []);
    ready = true;
    await Promise.all([scheduler.tick(), scheduler.tick()]);
    assert.deepEqual(order, ['cleanup', 'send']); await scheduler.stop();
    const disabled = createScheduler({ ...options, schedule: undefined });
    await disabled.tick(); await disabled.stop();
    assert.deepEqual(order, ['cleanup', 'send', 'cleanup']);
});

test('cleanup failure cannot prevent the new opening reminder', async () => {
    let sent = 0; let errors = 0;
    const scheduler = createScheduler({
        schedule: { mondayTime: '20:00' }, guildId, now: () => opening, isReady: () => true,
        cleanup: async () => { throw new Error('storage unavailable'); },
        claim: async () => true, send: async () => { sent++; }, onError: () => { errors++; },
    });
    await scheduler.tick(); await scheduler.stop();
    assert.equal(sent, 1); assert.equal(errors, 1);
});
