import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client } from 'discord.js';
import { displayTime, votingWindow, finalReminder, type ScheduleConfig } from '../reminders/schedule.js';
import { VotingStore, type Leader } from './store.js';

export function currentVote(now: Date) {
    const window = votingWindow(now);
    return { ...window, cycle: String(window.opens.getTime()), open: now >= window.opens && now < window.closes };
}
export function reminderSlot(now: Date, schedule: ScheduleConfig): string {
    return now >= new Date(finalReminder(now, schedule.mondayTime).getTime() + 600_000) ? 'final' : 'voting-open';
}
export function voteMessage(userId: string, cycle: string, voted: boolean, closes: Date) {
    return {
        content: `**Your Landsraad voting status**\n${voted ? '✅ You have already marked yourself as voted. Thank you and your guild for your support!' : 'You have not marked yourself as voted. Check the in-game outcome and vote if available to us.'}\nVoting closes: ${displayTime(closes)}\n✅ I voted · ⏹️ Snooze until the next reminder`,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`vote:${userId}:${cycle}:done`).setEmoji('✅').setLabel('I voted').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`vote:${userId}:${cycle}:snooze`).setEmoji('⏹️').setLabel('Snooze').setStyle(ButtonStyle.Secondary),
        )],
        allowedMentions: { parse: [] as [] },
    };
}

export class VotingService {
    private nextLeaderSync = 0;
    constructor(readonly store: VotingStore) {}

    /** Fetch the full roster, never just the member cache. Merge only after a complete fetch. */
    async refreshLeaders(client: Client, config: { guildId: string; roleId: string }, now = new Date()) {
        if (!client.isReady() || now.getTime() < this.nextLeaderSync) return;
        // Bound retries as well as successful refreshes; restarting triggers an immediate refresh.
        this.nextLeaderSync = now.getTime() + 5 * 60_000;
        if (config.roleId === config.guildId) throw new Error('The leader role must not be @everyone.');
        const guild = await client.guilds.fetch(config.guildId);
        const role = await guild.roles.fetch(config.roleId);
        if (!role) throw new Error('The configured guild leader role no longer exists.');
        const members = await guild.members.fetch();
        const ids = new Set(members.filter(member => !member.user.bot && member.roles.cache.has(config.roleId)).keys());
        await this.store.transaction(async (state, save) => {
            // Keep inactive records so preferences survive role removal and later restoration.
            for (const [id, leader] of Object.entries(state.leaders)) leader.active = ids.has(id);
            for (const id of ids) {
                const leader = this.leader(state.leaders, id, currentVote(now).cycle);
                leader.active = true;
            }
            await save();
        });
    }
    private leader(leaders: Record<string, Leader>, id: string, cycle: string): Leader {
        const leader = leaders[id] ??= { enabled: true, active: true, messages: [] };
        if (leader.cycle !== cycle) {
            leader.cycle = cycle;
            leader.voted = false;
            delete leader.snoozed;
        }
        return leader;
    }
    async status(id: string, now: Date = new Date()) {
        const vote = currentVote(now);
        return this.store.transaction(async (state, save) => {
            const leader = this.leader(state.leaders, id, vote.cycle);
            await save();
            return { ...vote, enabled: leader.enabled, voted: leader.voted === true };
        });
    }
    async preference(id: string, enabled: boolean, now = new Date()) {
        await this.store.transaction(async (state, save) => {
            this.leader(state.leaders, id, currentVote(now).cycle).enabled = enabled;
            await save();
        });
    }
    async act(id: string, cycle: string, action: 'done' | 'snooze', slot: string, now = new Date()) {
        return this.store.transaction(async (state, save) => {
            const vote = currentVote(now);
            if (!vote.open || vote.cycle !== cycle) return false;
            const leader = this.leader(state.leaders, id, cycle);
            if (action === 'done') leader.voted = true;
            else leader.snoozed = slot;
            await save();
            return true;
        });
    }
    /** Called only after a successful community announcement. Delay starts at actual delivery. */
    async enqueue(kind: string, now = new Date()) {
        if (kind !== 'voting-open' && kind !== 'final') return;
        const vote = currentVote(now);
        if (!vote.open) return;
        await this.store.transaction(async (state, save) => {
            const key = `${vote.cycle}-${kind}`;
            state.jobs[key] ??= { cycle: vote.cycle, slot: kind, due: now.getTime() + 600_000, closes: vote.closes.getTime() };
            await save();
        });
    }
    async tick(client: Client, config: { guildId: string; roleId: string }, now = new Date(), deliver = true) {
        if (!client.isReady()) return;
        await this.store.transaction(async (state, save) => {
            const vote = currentVote(now);
            for (const [id, leader] of Object.entries(state.leaders)) {
                // At the next opening, remove only this bot's tracked messages. Failed cleanup retries later.
                for (const message of [...leader.messages]) {
                    if (Number(message.cycle) >= Number(vote.cycle) || !vote.open) continue;
                    try {
                        const channel = await client.channels.fetch(message.channelId);
                        if (!channel?.isDMBased() || !('messages' in channel)) continue;
                        await channel.messages.delete(message.id);
                    } catch (error) {
                        if ((error as { code?: number }).code !== 10008) {
                            console.error('Personal reminder cleanup failed for user:', id);
                            continue;
                        }
                    }
                    leader.messages = leader.messages.filter(entry => entry.id !== message.id);
                    await save();
                }
            }
            for (const [key, job] of Object.entries(state.jobs)) {
                if (now.getTime() >= job.closes || now.getTime() >= job.due + 3_600_000) {
                    delete state.jobs[key];
                    for (const claim of Object.keys(state.claims)) if (claim.startsWith(`${key}:`)) delete state.claims[claim];
                    await save();
                    continue;
                }
                if (!deliver || now.getTime() < job.due || !vote.open || vote.cycle !== job.cycle) continue;
                for (const [id, existing] of Object.entries(state.leaders)) {
                    if (!existing.enabled || existing.active === false) continue;
                    const leader = this.leader(state.leaders, id, job.cycle);
                    const claim = `${key}:${id}`;
                    if (leader.voted || leader.snoozed === job.slot || state.claims[claim]) continue;
                    // Persist before contacting Discord: uncertain sends must not be repeated after a restart.
                    state.claims[claim] = true;
                    await save();
                    try {
                        const guild = await client.guilds.fetch(config.guildId);
                        const member = await guild.members.fetch({ user: id, force: true });
                        if (member.user.bot || !member.roles.cache.has(config.roleId)) continue;
                        const message = await member.send(voteMessage(id, job.cycle, false, new Date(job.closes)));
                        leader.messages.push({ id: message.id, channelId: message.channelId, cycle: job.cycle });
                        await save();
                    } catch {
                        console.error('Personal reminder could not be confirmed for user; no automatic retry:', id);
                    }
                }
            }
        });
    }
}
export const voting = new VotingService(new VotingStore('data/voting-state.json'));
