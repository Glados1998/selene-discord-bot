import 'dotenv/config';
import { createBot } from './bot.js';
import { loadBotConfig } from './config.js';

async function main(): Promise<void> {
    const config = loadBotConfig();
    const client = createBot();

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
            void client.destroy().catch(error => {
                console.error('Failed to shut down the bot:', error);
                process.exitCode = 1;
            });
        });
    }

    try {
        await client.login(config.token);
    } catch (error) {
        await client.destroy();
        throw error;
    }
}

main().catch(error => {
    console.error('Bot startup failed:', error);
    process.exitCode = 1;
});
