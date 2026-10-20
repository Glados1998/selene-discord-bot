import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadScheduleConfig } from '../src/config.js';
import { dueReminders } from '../src/reminders/schedule.js';
import { DeliveryStore } from '../src/reminders/delivery-store.js';
import { createScheduler } from '../src/reminders/scheduler.js';
import { buildReminderMessage } from '../src/reminders/send.js';

const schedule = { fridayTime: '20:00', mondayTime: '20:00' };
const env = {
    REMINDERS_ENABLED: 'true', GUILD_ID: '123456789012345678',
    GUILD_LEADER_ROLE_ID: '234567890123456789', REMINDER_CHANNEL_ID: '345678901234567890',
    FRIDAY_REMINDER_TIME: '20:00', MONDAY_REMINDER_TIME: '20:00',
};

test('schedule validates enabled settings and can be disabled without reminder configuration', () => {
    assert.equal(loadScheduleConfig({}), undefined);
    assert.equal(loadScheduleConfig({ REMINDERS_ENABLED: 'false' }), undefined);
    assert.equal(loadScheduleConfig(env)?.fridayTime, '20:00');
    for (const key of ['FRIDAY_REMINDER_TIME', 'MONDAY_REMINDER_TIME']) {
        for (const value of ['', '20:60', '8pm']) {
            assert.throws(() => loadScheduleConfig({ ...env, [key]: value }), new RegExp(key));
        }
    }
    assert.throws(() => loadScheduleConfig({ REMINDERS_ENABLED: 'yes' }), /REMINDERS_ENABLED/);
});

test('all three slots follow Paris winter and summer time, including DST transition Sundays', () => {
    for (const [date, kind] of [
        ['2026-10-09T18:00:00Z', 'preparation'],
        ['2026-10-11T19:00:00Z', 'voting-open'],
        ['2026-10-12T18:00:00Z', 'final'],
        ['2026-10-30T19:00:00Z', 'preparation'],
        ['2026-11-01T20:00:00Z', 'voting-open'],
        ['2026-11-02T19:00:00Z', 'final'],
        ['2026-03-29T19:00:00Z', 'voting-open'],
        ['2026-10-25T20:00:00Z', 'voting-open'],
    ]) {
        assert.equal(dueReminders(new Date(date!), schedule)[0]?.kind, kind, date);
    }
    assert.deepEqual(dueReminders(new Date('2026-10-09T17:59:59Z'), schedule), []);
    assert.equal(dueReminders(new Date('2026-10-09T18:59:59Z'), schedule).length, 1);
    assert.deepEqual(dueReminders(new Date('2026-10-09T19:00:00Z'), schedule), []);
    assert.deepEqual(dueReminders(new Date('2026-10-13T04:00:00Z'), schedule), []);
});

test('durable claims prevent duplicate delivery across concurrent claims and restarts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'selene-deliveries-'));
    try {
        const store = new DeliveryStore(directory);
        const claims = await Promise.all([store.claim('guild-2026-10-09-preparation'), store.claim('guild-2026-10-09-preparation')]);
        assert.equal(claims.filter(Boolean).length, 1);
        assert.equal(await new DeliveryStore(directory).claim('guild-2026-10-09-preparation'), false);
        assert.equal(await store.claim('guild-2026-10-16-preparation'), true);
        await assert.rejects(store.claim('../invalid'), /Invalid/);
        const blocked = join(directory, 'file');
        await writeFile(blocked, 'not a directory');
        await assert.rejects(new DeliveryStore(blocked).claim('test'));
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('scheduler skips offline clients, serializes ticks, and does not retry uncertain deliveries', async context => {
    context.mock.method(console, 'log', () => {});
    const claimed = new Set<string>();
    const failures: unknown[] = [];
    let ready = false;
    let sends = 0;
    let now = new Date('2026-10-09T18:00:00Z');
    const scheduler = createScheduler({
        schedule, guildId: env.GUILD_ID,
        isReady: () => ready, now: () => now,
        claim: async key => {
            if (claimed.has(key)) return false;
            claimed.add(key);
            return true;
        },
        send: async () => { sends++; throw new Error('Uncertain delivery'); },
        onError: error => { failures.push(error); },
    });
    await scheduler.tick();
    assert.equal(claimed.size, 0);
    ready = true;
    await Promise.all([scheduler.tick(), scheduler.tick()]);
    await scheduler.tick();
    assert.equal(sends, 1);
    assert.equal(failures.length, 1);
    now = new Date('2026-10-16T18:00:00Z');
    await scheduler.tick();
    assert.equal(sends, 2);
    await scheduler.stop();
    now = new Date('2026-10-23T18:00:00Z');
    await scheduler.tick();
    assert.equal(sends, 2);
});

test('scheduler never sends when durable storage fails', async () => {
    let sends = 0;
    let errors = 0;
    const scheduler = createScheduler({
        schedule, guildId: env.GUILD_ID, isReady: () => true,
        now: () => new Date('2026-10-09T18:00:00Z'),
        claim: async () => { throw new Error('Disk unavailable'); },
        send: async () => { sends++; }, onError: () => { errors++; },
    });
    await scheduler.tick();
    assert.equal(sends, 0);
    assert.equal(errors, 1);
    await scheduler.stop();
});

test('scheduled messages describe each phase and only allow the intended role mention', () => {
    for (const kind of ['preparation', 'voting-open', 'final'] as const) {
        const message = buildReminderMessage(env.GUILD_LEADER_ROLE_ID, kind);
        assert.deepEqual(message.allowedMentions.roles, [env.GUILD_LEADER_ROLE_ID]);
        assert.deepEqual(message.allowedMentions.parse, []);
        assert.match(message.content, /Europe\/Paris/);
    }
    assert.match(buildReminderMessage(env.GUILD_LEADER_ROLE_ID, 'preparation').content, /discussing/);
    assert.match(buildReminderMessage(env.GUILD_LEADER_ROLE_ID, 'voting-open').content, /now open/);
    assert.match(buildReminderMessage(env.GUILD_LEADER_ROLE_ID, 'final').content, /Tuesday.*06:00/);
});
