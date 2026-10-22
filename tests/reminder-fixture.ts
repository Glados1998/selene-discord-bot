import { Collection, type Client } from 'discord.js';
export const config = { guildId: '123456789012345678', roleId: '234567890123456789' };
export function fixture(roleId: string | null = config.roleId) {
    const payloads: { id: string; payload: any }[] = [];
    const reactions: string[] = [];
    const members = new Collection(['leader', 'blocked', 'ordinary', 'bot'].map(id => [id, {
        id, displayName: id === 'leader' ? 'Duke *Leto*' : id,
        user: { bot: id === 'bot' }, roles: { cache: new Map(id === 'ordinary' ? [] : [[config.roleId, {}]]) },
        send: async (payload: unknown) => { payloads.push({ id, payload }); if (id === 'blocked') throw new Error('DM disabled'); return { id: `message-${payloads.length}`, channelId: `dm-${id}`, react: async (emoji: string) => { reactions.push(emoji); } }; },
    }]));
    const client = { guilds: { fetch: async () => ({
        id: config.guildId,
        roles: { fetch: async () => roleId ? { id: roleId } : null },
        members: { fetch: async () => members },
    }) } } as unknown as Client;
    return { client, payloads, members, reactions };
}
