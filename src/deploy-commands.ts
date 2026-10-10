import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check if the bot is responding'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' })
    .setToken(process.env.DISCORD_TOKEN!);

async function deploy() {
    await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID!,
            process.env.GUILD_ID!
        ),
        { body: commands }
    );
    console.log('Successfully registered application commands.');
}

deploy().catch(console.error);
