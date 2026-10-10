import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

export const ping = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check if the bot is responding'),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.reply('Pong!');
    },
};
