import { MessageFlags, SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction } from 'discord.js';
import { loadReminderConfig, loadScheduleConfig } from '../config.js';
import { currentVote, reminderSlot, voteMessage, voting } from '../voting/service.js';

type VotingInteraction = ButtonInteraction | ChatInputCommandInteraction;
async function leaderAllowed(interaction: VotingInteraction) {
    const config = loadReminderConfig();
    if (interaction.guildId && interaction.guildId !== config.guildId) return false;
    const guild = await interaction.client.guilds.fetch(config.guildId);
    const member = await guild.members.fetch({ user: interaction.user.id, force: true }).catch(() => null);
    return config.roleId !== config.guildId && member?.roles.cache.has(config.roleId) === true;
}
async function begin(interaction: VotingInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (await leaderAllowed(interaction)) return true;
    await interaction.editReply('Only members with the configured guild leader role can use these controls.');
    return false;
}
export const votingStatus = {
    data: new SlashCommandBuilder().setName('voting-status').setDescription('View your Landsraad voting status and private controls'),
    async execute(interaction: ChatInputCommandInteraction) {
        if (!await begin(interaction)) return;
        const status = await voting.status(interaction.user.id);
        if (!status.open) {
            await interaction.editReply('Landsraad voting is currently closed. Use /schedule to see the next window.');
            return;
        }
        await interaction.editReply(voteMessage(interaction.user.id, status.cycle, status.voted, status.closes));
    },
};
export const reminderPreference = {
    data: new SlashCommandBuilder().setName('reminder').setDescription('View, enable, or disable your personal voting DMs')
        .addBooleanOption(option => option.setName('enabled').setDescription('Enable or disable personal reminder DMs')),
    async execute(interaction: ChatInputCommandInteraction) {
        if (!await begin(interaction)) return;
        const enabled = interaction.options.getBoolean('enabled');
        if (enabled !== null) await voting.preference(interaction.user.id, enabled);
        const status = await voting.status(interaction.user.id);
        await interaction.editReply({ content: `Your personal voting DMs are **${status.enabled ? 'enabled' : 'disabled'}**. Use /reminder enabled:true or enabled:false to change this.\nWhen enabled, reminders arrive about 10 minutes after the opening and closing-soon community announcements. Marking ✅ stops them for this cycle; ⏹️ snoozes until the next reminder. Allow DMs from this server to receive them.${loadScheduleConfig() ? '' : '\nAutomatic reminders are currently disabled for this server.'}`, allowedMentions: { parse: [] } });
    },
};
export async function handleVoteButton(interaction: ButtonInteraction) {
    const match = /^vote:(\d+):(\d+):(done|snooze)$/.exec(interaction.customId);
    if (!match) return;
    if (!await begin(interaction)) return;
    const [, owner, cycle, action] = match;
    if (owner !== interaction.user.id) {
        await interaction.editReply('These voting controls belong to another guild leader.');
        return;
    }
    const now = new Date();
    const schedule = loadScheduleConfig() ?? { fridayTime: '20:00', mondayTime: '20:00' };
    if (!await voting.act(owner!, cycle!, action as 'done' | 'snooze', reminderSlot(now, schedule), now)) {
        await interaction.editReply('This voting window has ended. Use /voting-status during the next window.');
        return;
    }
    const status = await voting.status(owner!, now);
    // Updating the source keeps the persistent DM accurate; acknowledgement stays private.
    await interaction.message.edit(voteMessage(owner!, cycle!, status.voted, currentVote(now).closes)).catch(() => {});
    await interaction.editReply({ content: action === 'done'
        ? '✅ Thank you and your guild for your support! Your vote is recorded and you will receive no more personal reminders this cycle.'
        : `⏹️ Understood — reminders are snoozed until the next scheduled reminder.${status.voted ? ' Your completed vote remains recorded, so no more reminders will be sent this cycle.' : ''}`,
        allowedMentions: { parse: [] },
    });
}
