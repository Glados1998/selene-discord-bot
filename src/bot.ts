import { Client, Events, GatewayIntentBits } from 'discord.js';
import { commands } from './commands/index.js';

export function createBot(): Client {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });

    client.once(Events.ClientReady, readyClient => {
        console.log(`Logged in as ${readyClient.user.tag}`);
    });

    client.on(Events.Error, error => {
        console.error('Discord client error:', error);
    });

    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) return;
        const command = commands.find(entry => entry.data.name === interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Command /${interaction.commandName} failed:`, error);
        }
    });

    return client;
}
