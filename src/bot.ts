/** Builds the Discord client. Every registered command passes the same authorization gate. */
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { commands } from './commands/index.js';
import { authorizeCommand, type CommandAccessConfig } from './auth/commands.js';

export function createBot(access: CommandAccessConfig): Client {
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
            if (!await authorizeCommand(interaction, access, command.access)) return;
            await command.execute(interaction);
        } catch (error) {
            console.error(`Command /${interaction.commandName} failed:`, error);
        }
    });

    return client;
}
