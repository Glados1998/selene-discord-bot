import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { sendReminder } from '../src/reminders/send.js';
import { reminderSend } from '../src/commands/reminder-send.js';
import { config, fixture } from './reminder-fixture.js';
const now = new Date('2026-10-18T19:00:00Z');
function store() {
    const keys = new Set<string>();
    return { claim: async (key: string) => { if (keys.has(key)) return false; keys.add(key); return true; } };
}
test('personal DMs isolate failures and deduplicate manual/scheduled sends across a cycle', async () => {
    const f = fixture(); const claims = store();
    assert.deepEqual(await sendReminder(f.client, config, 'voting-open', now, claims), { sent: 1, skipped: 0, failed: ['blocked'] });
    assert.deepEqual(await sendReminder(f.client, config, 'voting-open', now, claims), { sent: 0, skipped: 2, failed: [] });
    assert.equal(f.payloads.length, 2);
    assert.match(f.payloads[0]!.payload.content, /Hello Duke \\?\*/);
    assert.deepEqual(f.payloads[0]!.payload.allowedMentions, { parse: [], roles: [], users: [], repliedUser: false });
    await sendReminder(f.client, config, 'final', new Date('2026-10-19T18:00:00Z'), claims);
    await sendReminder(f.client, config, 'voting-open', new Date('2026-10-25T20:00:00Z'), claims);
    assert.equal(f.payloads.length, 6);
});
test('manual sends reject outside the window, including exact closing, before roster or claims', async () => {
    const f = fixture();
    for (const date of ['2026-10-18T18:59:59Z', '2026-10-20T04:00:00Z']) {
        await assert.rejects(sendReminder(f.client, config, 'voting-open', new Date(date), store()), /outside/);
    }
    assert.equal(f.payloads.length, 0);
    assert.equal(f.payloads.length, 0);
});
test('storage failure prevents sending and concurrent calls claim each recipient once', async () => {
    const f = fixture();
    await assert.rejects(sendReminder(f.client, config, 'voting-open', now, { claim: async () => { throw new Error('disk'); } }), /disk/);
    assert.equal(f.payloads.length, 0);
    const claims = store();
    await Promise.all([sendReminder(f.client, config, 'voting-open', now, claims), sendReminder(f.client, config, 'voting-open', now, claims)]);
    assert.equal(f.payloads.length, 2);
});
test('test option sends only to invoking admin without resolving recipients', async () => {
    const original = { ...process.env };
    Object.assign(process.env, { GUILD_ID: config.guildId, GUILD_LEADER_ROLE_ID: config.roleId });
    const payloads: any[] = []; const replies: any[] = [];
    try {
        await reminderSend.execute({
            guildId: config.guildId, options: { getBoolean: () => true, getString: () => 'final' },
            user: { displayName: 'Admin', send: async (payload: unknown) => { payloads.push(payload); } },
            deferReply: async (payload: unknown) => assert.deepEqual(payload, { flags: MessageFlags.Ephemeral }),
            editReply: async (payload: unknown) => { replies.push(payload); },
        } as unknown as ChatInputCommandInteraction);
        assert.equal(payloads.length, 1); assert.match(payloads[0].content, /TEST PREVIEW/); assert.match(payloads[0].content, /voting closes soon/);
        assert.match(replies[0], /only to you/);
    } finally {
        for (const key of ['GUILD_ID', 'GUILD_LEADER_ROLE_ID']) {
            if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
        }
    }
});
