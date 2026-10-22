/** Builds the Discord client. Every registered command passes the same authorization gate. */
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { handleReminderReaction, handleReminderReactionRemoval } from './reminders/reactions.js';
import { commands } from './commands/index.js';
import { authorizeCommand, type CommandAccessConfig } from './auth/commands.js';

export function createBot(access: CommandAccessConfig): Client {
    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessageReactions],
        partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
    });

    client.on(Events.MessageReactionAdd, (reaction, user) => {
        void handleReminderReaction(reaction, user, access.guildId).catch(error => {
            console.error('Reminder reaction could not be processed or acknowledged:', error instanceof Error ? error.message : 'Unknown error');
        });
    });

    client.on(Events.MessageReactionRemove, (reaction, user) => {
        void handleReminderReactionRemoval(reaction, user, access.guildId).catch(error => {
            console.error('Reminder reaction removal could not be processed or acknowledged:', error instanceof Error ? error.message : 'Unknown error');
        });
    });

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
