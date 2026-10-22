/** Process entry point: validate configuration, connect, start scheduling, and drain on shutdown. */
import 'dotenv/config';
import { createBot } from './bot.js';
import { loadBotConfig, loadScheduleConfig, loadCommandAccessConfig } from './config.js';
import { Events } from 'discord.js';
import { DeliveryStore } from './reminders/delivery-store.js';
import { createScheduler } from './reminders/scheduler.js';
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
        send: kind => sendReminder(client, schedule, kind),
        isReady: () => client.isReady(),
    }) : undefined;
    client.once(Events.ClientReady, () => {
        if (scheduler) {
            console.log(`Reminders enabled (Europe/Amsterdam): Sunday 21:00, Monday ${schedule!.mondayTime}.`);
            scheduler.start();
        } else {
            console.log('Automatic reminders are disabled.');
        }
    });

    async function shutdown(): Promise<void> {
        await scheduler?.stop();
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
