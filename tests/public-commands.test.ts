import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildScheduleMessage } from '../src/commands/schedule.js';
import { votingWindow, displayTime, nextPreparation, finalReminder } from '../src/reminders/schedule.js';

const now = new Date('2026-10-16T12:00:00Z');
test('public schedule renders configured reminders and voting dates as localized timestamps', () => {
    const message = buildScheduleMessage({ fridayTime: '18:30', mondayTime: '20:15' }, now);
    for (const date of ['2026-10-16T16:30:00Z', '2026-10-18T19:00:00Z', '2026-10-19T18:15:00Z', '2026-10-20T04:00:00Z']) {
        assert.ok(message.includes(displayTime(new Date(date))), date);
    }
    assert.match(message, /your timezone/);
});

test('disabled reminders retain localized voting information', () => {
    const message = buildScheduleMessage(undefined, now);
    assert.match(message, /Automatic reminders are currently disabled/);
    assert.doesNotMatch(message, /Next preparation|Final reminder/);
    assert.ok(message.includes(displayTime(new Date('2026-10-18T19:00:00Z'))));
});

test('voting windows use the target date DST offset across both transitions and year rollover', () => {
    for (const [observed, opens, closes] of [
        ['2026-03-27T12:00:00Z', '2026-03-29T19:00:00Z', '2026-03-31T04:00:00Z'],
        ['2026-10-23T12:00:00Z', '2026-10-25T20:00:00Z', '2026-10-27T05:00:00Z'],
        ['2026-12-31T12:00:00Z', '2027-01-03T20:00:00Z', '2027-01-05T05:00:00Z'],
    ]) {
        const window = votingWindow(new Date(observed!));
        assert.equal(window.opens.toISOString(), new Date(opens!).toISOString());
        assert.equal(window.closes.toISOString(), new Date(closes!).toISOString());
        assert.equal(window.closes.getTime() - window.opens.getTime(), 33 * 60 * 60 * 1000);
    }
});

test('current window stays selected from opening until the exact closing boundary', () => {
    for (const observed of ['2026-10-18T18:59:59Z', '2026-10-18T19:00:00Z', '2026-10-20T03:59:59Z']) {
        assert.equal(votingWindow(new Date(observed)).opens.toISOString(), '2026-10-18T19:00:00.000Z');
    }
    assert.equal(votingWindow(new Date('2026-10-20T04:00:00Z')).opens.toISOString(), '2026-10-25T20:00:00.000Z');
    assert.equal(nextPreparation(new Date('2026-10-23T18:01:00Z'), '20:00').toISOString(), '2026-10-30T19:00:00.000Z');
    assert.equal(finalReminder(new Date('2026-10-23T12:00:00Z'), '19:00').toISOString(), '2026-10-26T18:00:00.000Z');
});
