/** Wall-clock scheduling uses Paris time, independent of the host timezone and UTC offset. */
export const REMINDER_TIME_ZONE = 'Europe/Paris';
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
