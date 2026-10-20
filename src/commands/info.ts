import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

export const info = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Learn about the Landsraad Herald and its public commands'),
    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.reply({
            flags: MessageFlags.Ephemeral,
            content: [
                '**Landsraad Herald**',
                'The Herald helps Selene - Atreides coordinate Landsraad decree voting in Dune: Awakening. It reminds guild leaders to prepare, discuss preferred decrees, and vote during the weekly voting window.',
                '',
                '**Commands available to everyone in this server**',
                '• `/schedule` — see when voting opens and closes, plus the weekly reminder schedule.',
                '• `/info` — learn what the Herald does and which public commands you can use.',
                '',
                'Check the in-game outcome against the Harkonnen and vote according to our guild discussion if voting is available to us. The Herald does not check the game outcome, cast votes, or track who has voted.',
            ].join('\n'),
            allowedMentions: { parse: [] },
        });
    },
};
