/** Wall-clock scheduling uses Amsterdam time, independent of the host timezone and UTC offset. */
export const REMINDER_TIME_ZONE = 'Europe/Amsterdam';
export type ScheduledReminderKind = 'preparation' | 'voting-open' | 'final';
export interface ScheduleConfig {
    fridayTime: string;
    mondayTime: string;
}

const localClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: REMINDER_TIME_ZONE,
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// Give a restarted bot up to one hour to catch up, without sending stale notices.
export function dueReminders(now: Date, config: ScheduleConfig) {
    const parts = Object.fromEntries(localClock.formatToParts(now).map(part => [part.type, part.value]));
    const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
    const slots: { weekday: string; time: string; kind: ScheduledReminderKind }[] = [
        { weekday: 'Fri', time: config.fridayTime, kind: 'preparation' },
        { weekday: 'Sun', time: '21:00', kind: 'voting-open' },
        { weekday: 'Mon', time: config.mondayTime, kind: 'final' },
    ];
    return slots.filter(slot => {
        const [hour, minute] = slot.time.split(':').map(Number);
        const elapsed = minuteOfDay - (hour! * 60 + minute!);
        return parts.weekday === slot.weekday && elapsed >= 0 && elapsed < 60;
    }).map(slot => ({
        kind: slot.kind,
        key: `${parts.year}-${parts.month}-${parts.day}-${slot.kind}`,
    }));
}

// Convert an Amsterdam calendar date and clock time to an absolute instant.
// Re-evaluate the offset for the target date rather than using today's DST offset.
function localInstant(calendar: Date, time: string): Date {
    const [hour, minute] = time.split(':').map(Number);
    const target = Date.UTC(calendar.getUTCFullYear(), calendar.getUTCMonth(), calendar.getUTCDate(), hour!, minute!);
    let instant = target;
    for (let attempt = 0; attempt < 3; attempt++) {
        const parts = Object.fromEntries(localClock.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
        const displayed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
        instant += target - displayed;
    }
    return new Date(instant);
}

function localCalendar(now: Date): Date {
    const parts = Object.fromEntries(localClock.formatToParts(now).map(part => [part.type, part.value]));
    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

/** Keep the current voting window until it closes, then show the next week's window. */
export function votingWindow(now: Date = new Date()) {
    const today = localCalendar(now);
    let sunday = addDays(today, -today.getUTCDay());
    if (now >= localInstant(addDays(sunday, 2), '06:00')) sunday = addDays(sunday, 7);
    return { opens: localInstant(sunday, '21:00'), closes: localInstant(addDays(sunday, 2), '06:00') };
}

export function nextPreparation(now: Date, time: string): Date {
    const today = localCalendar(now);
    let friday = addDays(today, (5 - today.getUTCDay() + 7) % 7);
    if (localInstant(friday, time) < now) friday = addDays(friday, 7);
    return localInstant(friday, time);
}

export function finalReminder(now: Date, time: string): Date {
    return localInstant(addDays(localCalendar(votingWindow(now).closes), -1), time);
}

export function displayTime(date: Date): string {
    const seconds = Math.floor(date.getTime() / 1000);
    return `<t:${seconds}:F> (<t:${seconds}:R>)`;
}
