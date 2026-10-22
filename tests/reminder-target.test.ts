import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadReminderConfig } from '../src/config.js';
import { resolveReminderTarget } from '../src/reminders/target.js';

import { config, fixture } from './reminder-fixture.js';
test('DM config requires guild and role, without a channel', () => {
    assert.deepEqual(loadReminderConfig({ GUILD_ID: config.guildId, GUILD_LEADER_ROLE_ID: config.roleId }), config);
    assert.throws(() => loadReminderConfig({ GUILD_ID: config.guildId }), /GUILD_LEADER_ROLE_ID/);
});
test('fresh roster includes only human leaders and rejects invalid or empty targets', async () => {
    assert.deepEqual([...((await resolveReminderTarget(fixture().client, config)).leaders.keys())], ['leader', 'blocked']);
    for (const role of [null, config.guildId]) await assert.rejects(resolveReminderTarget(fixture(role).client, config), /existing role/);
    const empty = fixture(); empty.members.clear();
    await assert.rejects(resolveReminderTarget(empty.client, config), /No human/);
});
