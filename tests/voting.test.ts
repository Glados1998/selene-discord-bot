import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from 'discord.js';
import { VotingStore } from '../src/voting/store.js';
import { currentVote, VotingService, reminderSlot, voteMessage } from '../src/voting/service.js';

const opening = new Date('2026-10-18T19:00:00Z');
const final = new Date('2026-10-19T18:00:00Z');
const after = (date: Date, minutes: number) => new Date(+date + minutes * 60_000);
const config = { guildId: 'server', roleId: 'leader' };
async function fixture(context: { after: (fn: () => Promise<void>) => void }) {
    const directory = await mkdtemp(join(tmpdir(), 'selene-voting-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, 'state.json');
    const service = new VotingService(new VotingStore(path));
    const sent: string[] = [];
    const deleted: string[] = [];
    const blocked = new Set<string>();
    const removed = new Set<string>();
    const client = {
        isReady: () => true,
        channels: { fetch: async () => ({ isDMBased: () => true, messages: { delete: async (id: string) => { deleted.push(id); } } }) },
        guilds: { fetch: async () => ({ members: { fetch: async ({ user }: { user: string }) => ({
            user: { bot: false },
            roles: { cache: { has: () => !removed.has(user) } },
            send: async () => {
                if (blocked.has(user)) throw new Error('DM blocked');
                sent.push(user);
                return { id: `message-${sent.length}`, channelId: `dm-${user}` };
            },
        }) } }) },
    } as unknown as Client;
    return { service, path, client, sent, deleted, blocked, removed };
}

test('DMs respect preferences, actual announcement plus ten minutes, and survive restart without duplicates', async context => {
    const f = await fixture(context);
    await f.service.preference('1', true, opening);
    await f.service.preference('2', false, opening);
    await f.service.tick(f.client, config, after(opening, 20));
    assert.deepEqual(f.sent, []);
    await f.service.enqueue('voting-open', after(opening, 5));
    await f.service.tick(f.client, config, after(opening, 14));
    assert.deepEqual(f.sent, []);
    const restarted = new VotingService(new VotingStore(f.path));
    await restarted.tick(f.client, config, after(opening, 15));
    await restarted.tick(f.client, config, after(opening, 16));
    assert.deepEqual(f.sent, ['1']);
});

test('voted stops the cycle; snooze stops only the current reminder; preferences persist into next cycle', async context => {
    const f = await fixture(context);
    for (const id of ['1', '2', '3']) await f.service.preference(id, true, opening);
    const cycle = currentVote(opening).cycle;
    await f.service.act('1', cycle, 'done', 'voting-open', opening);
    await f.service.act('2', cycle, 'snooze', 'voting-open', opening);
    await f.service.preference('3', false, opening);
    await f.service.enqueue('voting-open', opening);
    await f.service.tick(f.client, config, after(opening, 10));
    assert.deepEqual(f.sent, []);
    await f.service.enqueue('final', final);
    await f.service.tick(f.client, config, after(final, 10));
    assert.deepEqual(f.sent, ['2']);
    const next = new Date('2026-10-25T20:00:00Z');
    assert.equal((await f.service.status('1', next)).voted, false);
    assert.equal((await f.service.status('1', next)).enabled, true);
    assert.equal((await f.service.status('3', next)).enabled, false);
    await f.service.enqueue('voting-open', next);
    await f.service.tick(f.client, config, after(next, 10));
    assert.deepEqual(f.deleted, ['message-1']);
    assert.deepEqual(f.sent, ['2', '1', '2']);
});

test('blocked DMs and removed leaders do not prevent other delivery or create retries', async context => {
    const f = await fixture(context);
    for (const id of ['1', '2', '3']) await f.service.preference(id, true, opening);
    f.blocked.add('1'); f.removed.add('2');
    await f.service.enqueue('voting-open', opening);
    await f.service.tick(f.client, config, after(opening, 10));
    f.blocked.clear();
    await f.service.tick(f.client, config, after(opening, 11));
    assert.deepEqual(f.sent, ['3']);
});

test('closed windows and old buttons cannot change status; both controls remain after voting', async context => {
    const f = await fixture(context);
    const cycle = currentVote(opening).cycle;
    assert.equal(await f.service.act('1', cycle, 'done', 'final', new Date('2026-10-20T04:00:00Z')), false);
    assert.equal(await f.service.act('1', 'old', 'done', 'voting-open', opening), false);
    assert.equal(currentVote(after(opening, -1)).open, false);
    assert.equal(currentVote(opening).open, true);
    const message = voteMessage('1', cycle, true, currentVote(opening).closes);
    assert.match(message.content, /already marked yourself as voted/);
    assert.equal(message.components[0]!.components.length, 2);
    assert.equal(reminderSlot(after(final, 9), { fridayTime: '20:00', mondayTime: '20:00' }), 'voting-open');
    assert.equal(reminderSlot(after(final, 10), { fridayTime: '20:00', mondayTime: '20:00' }), 'final');
});

test('expired jobs do not send stale messages; concurrent transactions preserve preferences', async context => {
    const f = await fixture(context);
    await Promise.all(['1', '2', '3'].map(id => f.service.preference(id, true, opening)));
    await f.service.enqueue('voting-open', opening);
    await f.service.tick(f.client, config, after(opening, 71));
    assert.deepEqual(f.sent, []);
    for (const id of ['1', '2', '3']) assert.equal((await f.service.status(id, opening)).enabled, true);
});
