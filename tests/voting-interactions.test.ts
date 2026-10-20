import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageFlags, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';
import { handleVoteButton, votingStatus, reminderPreference } from '../src/commands/voting.js';
import { voting } from '../src/voting/service.js';

const guildId = '123456789012345678';
const userId = '234567890123456789';
function fixture(role = true, overrides = {}) {
    const replies: unknown[] = [];
    const defers: unknown[] = [];
    const interaction = {
        guildId, user: { id: userId },
        customId: `vote:${userId}:123:done`,
        client: { guilds: { fetch: async () => ({ members: { fetch: async () => ({ roles: { cache: { has: () => role } } }) } }) } },
        deferReply: async (value: unknown) => { defers.push(value); },
        editReply: async (value: unknown) => { replies.push(value); },
        options: { getBoolean: () => null },
        ...overrides,
    };
    return { interaction, replies, defers };
}
function setup(context: { after: (fn: () => void) => void }) {
    const old = { ...process.env };
    process.env.GUILD_ID = guildId;
    process.env.GUILD_LEADER_ROLE_ID = '345678901234567890';
    process.env.REMINDER_CHANNEL_ID = '456789012345678901';
    process.env.REMINDERS_ENABLED = 'false';
    context.after(() => { process.env = old; });
}

test('personal commands deny users without the exact leader role before reading or writing preferences', async context => {
    setup(context);
    const status = context.mock.method(voting, 'status');
    const preference = context.mock.method(voting, 'preference');
    for (const command of [votingStatus, reminderPreference]) {
        const f = fixture(false);
        await command.execute(f.interaction as unknown as ChatInputCommandInteraction);
        assert.match(String(f.replies[0]), /Only members/);
        assert.deepEqual(f.defers, [{ flags: MessageFlags.Ephemeral }]);
    }
    assert.equal(status.mock.callCount(), 0);
    assert.equal(preference.mock.callCount(), 0);
});

test('DM buttons reject other users and old cycles without changing votes', async context => {
    setup(context);
    const act = context.mock.method(voting, 'act', async () => false);
    const other = fixture(true, { guildId: null, customId: 'vote:999:123:done' });
    await handleVoteButton(other.interaction as unknown as ButtonInteraction);
    assert.match(String(other.replies[0]), /another guild leader/);
    assert.equal(act.mock.callCount(), 0);
    const stale = fixture(true, { guildId: null });
    await handleVoteButton(stale.interaction as unknown as ButtonInteraction);
    assert.match(String(stale.replies[0]), /window has ended/);
    assert.equal(act.mock.callCount(), 1);
});

test('closed voting status provides no controls', async context => {
    setup(context);
    context.mock.method(voting, 'status', async () => ({ open: false }));
    const f = fixture();
    await votingStatus.execute(f.interaction as unknown as ChatInputCommandInteraction);
    assert.match(String(f.replies[0]), /currently closed/);
});
