import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { commands } from './commands/index.js';
import { loadDeploymentConfig } from './config.js';

async function deploy(): Promise<void> {
    const config = loadDeploymentConfig();
    const rest = new REST({ version: '10' }).setToken(config.token);

    await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands.map(command => command.data.toJSON()) },
    );
    console.log('Successfully registered application commands.');
}

deploy().catch(error => {
    console.error('Command registration failed:', error);
    process.exitCode = 1;
});
