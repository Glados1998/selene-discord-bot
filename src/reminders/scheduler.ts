/** Serial polling with durable claims. Failed or uncertain sends are deliberately not retried. */
import { dueReminders, type ScheduleConfig, type ScheduledReminderKind } from './schedule.js';

interface SchedulerOptions {
    schedule: ScheduleConfig;
    guildId: string;
    claim: (key: string) => Promise<boolean>;
    send: (kind: ScheduledReminderKind) => Promise<unknown>;
    isReady: () => boolean;
    now?: () => Date;
    onError?: (error: unknown) => void;
}

export function createScheduler(options: SchedulerOptions) {
    let running: Promise<void> | undefined;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const report = options.onError ?? (error => console.error('Scheduled reminder failed; check the channel before retrying manually:', error));

    async function run(): Promise<void> {
        if (!options.isReady()) return;
        for (const occurrence of dueReminders(options.now?.() ?? new Date(), options.schedule)) {
            if (stopped) break;
            try {
                if (await options.claim(`${options.guildId}-${occurrence.key}`)) {
                    await options.send(occurrence.kind);
                    console.log(`Scheduled reminder sent: ${occurrence.key}`);
                }
            } catch (error) {
                report(error);
            }
        }
    }

    // Share the in-flight promise so slow REST requests cannot overlap the next poll.
    function tick(): Promise<void> {
        if (stopped) return Promise.resolve();
        if (running) return running;
        running = run().finally(() => { running = undefined; });
        return running;
    }

    return {
        tick,
        start() {
            if (timer || stopped) return;
            timer = setInterval(() => { void tick().catch(report); }, 30_000);
            void tick().catch(report);
        },
        async stop() {
            stopped = true;
            if (timer) clearInterval(timer);
            await running;
        },
    };
}
