import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Collection, type Client } from 'discord.js';
import { VotingService, currentVote } from '../src/voting/service.js';
import { VotingStore, type VotingState } from '../src/voting/store.js';

const now = new Date('2026-10-18T19:00:00Z');
const config = { guildId: 'server', roleId: 'leader' };
const later = (minutes: number) => new Date(+now + minutes * 60_000);
async function fixture(context: { after: (fn: () => Promise<void>) => void }) {
    const dir = await mkdtemp(join(tmpdir(), 'selene-roster-'));
    context.after(() => rm(dir, { recursive: true, force: true }));
    const path = join(dir, 'voting.json');
    const members = new Collection<string, { user: { bot: boolean }; roles: { cache: Set<string> } }>();
    const add = (id: string, leader = true, bot = false) => members.set(id, { user: { bot }, roles: { cache: new Set(leader ? ['leader'] : []) } });
    let failed = false;
    let fetches = 0;
    const client = { isReady: () => true, guilds: { fetch: async () => ({
        roles: { fetch: async () => ({ id: 'leader' }) },
        members: { fetch: async () => { fetches++; if (failed) throw new Error('timeout'); return members; } },
    }) } } as unknown as Client;
    return { service: new VotingService(new VotingStore(path)), client, add, members,
        fail: () => { failed = true; }, fetches: () => fetches,
        read: async () => JSON.parse(await readFile(path, 'utf8')) as VotingState,
        restart: () => new VotingService(new VotingStore(path)),
    };
}

test('full roster discovery persists new leaders enabled by default and excludes bots and non-leaders', async context => {
    const f = await fixture(context);
    f.add('1'); f.add('2', false); f.add('3', true, true);
    await f.service.refreshLeaders(f.client, config, now);
    const state = await f.read();
    assert.deepEqual(Object.keys(state.leaders), ['1']);
    assert.equal(state.leaders['1']!.enabled, true);
    assert.equal(state.leaders['1']!.active, true);
    assert.equal(state.leaders['1']!.voted, false);
    assert.equal((await f.restart().status('1', now)).enabled, true);
});

test('refresh discovers new leaders every five minutes without overwriting votes, snoozes, or opt-outs', async context => {
    const f = await fixture(context);
    f.add('1'); f.add('2');
    await f.service.refreshLeaders(f.client, config, now);
    await f.service.preference('1', false, now);
    await f.service.act('1', currentVote(now).cycle, 'done', 'voting-open', now);
    await f.service.act('2', currentVote(now).cycle, 'snooze', 'voting-open', now);
    f.add('3');
    await f.service.refreshLeaders(f.client, config, later(4));
    assert.equal(f.fetches(), 1);
    assert.equal((await f.read()).leaders['3'], undefined);
    await f.service.refreshLeaders(f.client, config, later(5));
    const state = await f.read();
    assert.equal(f.fetches(), 2);
    assert.equal(state.leaders['1']!.enabled, false);
    assert.equal(state.leaders['1']!.voted, true);
    assert.equal(state.leaders['2']!.snoozed, 'voting-open');
    assert.equal(state.leaders['3']!.enabled, true);
});

test('removed leaders become inactive and returning leaders retain their saved preferences', async context => {
    const f = await fixture(context);
    f.add('1');
    await f.service.refreshLeaders(f.client, config, now);
    await f.service.preference('1', false, now);
    f.members.delete('1');
    await f.service.refreshLeaders(f.client, config, later(5));
    assert.equal((await f.read()).leaders['1']!.active, false);
    f.add('1');
    await f.service.refreshLeaders(f.client, config, later(10));
    assert.equal((await f.read()).leaders['1']!.active, true);
    assert.equal((await f.read()).leaders['1']!.enabled, false);
});

test('failed full fetch leaves all saved data intact and retries are bounded', async context => {
    const f = await fixture(context);
    f.add('1');
    await f.service.refreshLeaders(f.client, config, now);
    const before = await f.read();
    f.fail();
    await assert.rejects(f.service.refreshLeaders(f.client, config, later(5)), /timeout/);
    await f.service.refreshLeaders(f.client, config, later(6));
    assert.deepEqual(await f.read(), before);
    assert.equal(f.fetches(), 2);
});
