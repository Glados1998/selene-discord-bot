/** Process entry point: validate configuration, connect, start scheduling, and drain on shutdown. */
import 'dotenv/config';
import { createBot } from './bot.js';
import { loadBotConfig, loadScheduleConfig, loadCommandAccessConfig } from './config.js';
import { Events } from 'discord.js';
import { DeliveryStore } from './reminders/delivery-store.js';
import { createScheduler } from './reminders/scheduler.js';
import { voting } from './voting/service.js';
import { loadReminderConfig } from './config.js';
import { sendReminder } from './reminders/send.js';

async function main(): Promise<void> {
    const config = loadBotConfig();
    const schedule = loadScheduleConfig();
    const client = createBot(loadCommandAccessConfig());
    const store = new DeliveryStore('data/reminder-deliveries');
    const scheduler = schedule ? createScheduler({
        schedule,
        guildId: schedule.guildId,
        claim: key => store.claim(key),
        send: async kind => {
            const message = await sendReminder(client, schedule, kind);
            await voting.enqueue(kind);
            return message;
        },
        isReady: () => client.isReady(),
    }) : undefined;
    let personalTimer: ReturnType<typeof setInterval> | undefined;
    let personalRun: Promise<void> | undefined;
    const personalTick = () => {
        if (personalRun) return;
        personalRun = Promise.resolve().then(async () => {
            const reminderConfig = loadReminderConfig();
            await voting.refreshLeaders(client, reminderConfig).catch(() => {
                console.error('Guild leader sync failed; saved preferences retained. Check Server Members Intent and the configured role.');
            });
            await voting.tick(client, reminderConfig, new Date(), !!schedule);
        })
            .catch(() => console.error('Personal reminder processing failed; check configuration and storage.'))
            .finally(() => { personalRun = undefined; });
    };
    client.once(Events.ClientReady, () => {
        personalTimer = setInterval(personalTick, 30_000);
        personalTick();
        if (scheduler) {
            console.log(`Reminders enabled (Europe/Amsterdam): Friday ${schedule!.fridayTime}, Sunday 21:00, Monday ${schedule!.mondayTime}.`);
            scheduler.start();
        } else {
            console.log('Automatic reminders are disabled.');
        }
    });

    async function shutdown(): Promise<void> {
        if (personalTimer) clearInterval(personalTimer);
        await scheduler?.stop();
        await personalRun;
        await client.destroy();
    }

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
            void shutdown().catch(error => {
                console.error('Failed to shut down the bot:', error);
                process.exitCode = 1;
            });
        });
    }

    try {
        await client.login(config.token);
    } catch (error) {
        await shutdown();
        throw error;
    }
}

main().catch(error => {
    console.error('Bot startup failed:', error);
    process.exitCode = 1;
});
