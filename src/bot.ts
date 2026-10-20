/** Builds the Discord client. Every registered command passes the same authorization gate. */
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { handleVoteButton } from './commands/voting.js';
import { commands } from './commands/index.js';
import { authorizeCommand, type CommandAccessConfig } from './auth/commands.js';

export function createBot(access: CommandAccessConfig): Client {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

    client.once(Events.ClientReady, readyClient => {
        console.log(`Logged in as ${readyClient.user.tag}`);
    });

    client.on(Events.Error, error => {
        console.error('Discord client error:', error);
    });

    client.on(Events.InteractionCreate, async interaction => {
        if (interaction.isButton?.() && interaction.customId.startsWith('vote:')) {
            try { await handleVoteButton(interaction); }
            catch {
                console.error('Voting button failed.');
                if (interaction.deferred) await interaction.editReply('Could not save your voting status. Please try /voting-status again.').catch(() => {});
            }
            return;
        }
        if (!interaction.isChatInputCommand()) return;
        const command = commands.find(entry => entry.data.name === interaction.commandName);
        if (!command) return;

        try {
            if (!await authorizeCommand(interaction, access, command.access)) return;
            await command.execute(interaction);
        } catch (error) {
            console.error(`Command /${interaction.commandName} failed:`, error);
            if (interaction.deferred) await interaction.editReply('The request could not be completed. Please try again.').catch(() => {});
        }
    });

    return client;
}
