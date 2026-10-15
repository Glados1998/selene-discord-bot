import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildScheduleMessage } from '../src/commands/schedule.js';

test('public schedule uses configured reminder times and identifies the voting window timezone', () => {
    const message = buildScheduleMessage({ fridayTime: '18:30', mondayTime: '22:15' });
    assert.match(message, /Friday at 18:30/);
    assert.match(message, /Monday at 22:15/);
    assert.match(message, /Voting opens:\*\* Sunday at 21:00/);
    assert.match(message, /Voting closes:\*\* Tuesday at 06:00/);
    assert.match(message, /Europe\/Paris/);
});

test('disabled reminders do not advertise active reminder slots but retain voting information', () => {
    const message = buildScheduleMessage(undefined);
    assert.match(message, /Automatic reminders are currently disabled/);
    assert.doesNotMatch(message, /Friday|Monday/);
    assert.match(message, /Sunday at 21:00/);
    assert.match(message, /Tuesday at 06:00/);
});
