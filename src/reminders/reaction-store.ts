/** Durable message ownership and cycle-scoped choices. Run one bot process per data directory. */
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type ReminderChoice = 'voted' | 'snoozed';
export interface ReminderMessage {
    guildId: string;
    userId: string;
    channelId: string;
    opens: number;
    closes: number;
    test: boolean;
}

function safeKey(value: string): string {
    if (!/^[a-zA-Z0-9-]+$/.test(value)) throw new Error('Invalid reminder state key.');
    return value;
}

export class ReactionStore {
    private readonly pending = new Map<string, Promise<void>>();
    constructor(private readonly directory: string) {}

    // Serialize user choices with the last check before delivery, including manual sends.
    async withRecipient<T>(guildId: string, userId: string, action: () => Promise<T>): Promise<T> {
        const key = `${guildId}-${userId}`;
        const previous = this.pending.get(key) ?? Promise.resolve();
        const current = previous.then(action);
        const settled = current.then(() => {}, () => {});
        this.pending.set(key, settled);
        try { return await current; }
        finally { if (this.pending.get(key) === settled) this.pending.delete(key); }
    }

    private async writeRecord(folder: string, key: string, value: unknown): Promise<void> {
        const directory = join(this.directory, folder);
        await mkdir(directory, { recursive: true });
        const target = join(directory, `${safeKey(key)}.json`);
        const temporary = `${target}.${randomUUID()}.tmp`;
        try {
            const file = await open(temporary, 'wx', 0o600);
            try { await file.writeFile(JSON.stringify(value)); await file.sync(); }
            finally { await file.close(); }
            await rename(temporary, target);
        } finally { await rm(temporary, { force: true }); }
    }

    async bind(messageId: string, binding: ReminderMessage): Promise<void> {
        await this.writeRecord('messages', messageId, binding);
    }

    async message(messageId: string): Promise<ReminderMessage | undefined> {
        let value: unknown;
        try { value = JSON.parse(await readFile(join(this.directory, 'messages', `${safeKey(messageId)}.json`), 'utf8')); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
            throw error;
        }
        const record = value as ReminderMessage | null;
        if (!record || typeof record.guildId !== 'string' || typeof record.userId !== 'string' ||
            typeof record.channelId !== 'string' || !Number.isSafeInteger(record.opens) ||
            !Number.isSafeInteger(record.closes) || record.closes <= record.opens || typeof record.test !== 'boolean') {
            throw new Error('Invalid stored reminder message.');
        }
        return record;
    }

    private choiceKey(guildId: string, userId: string, opens: number, choice: ReminderChoice): string {
        return safeKey(`${guildId}-${userId}-${opens}-${choice}`);
    }

    async choice(guildId: string, userId: string, opens: number): Promise<ReminderChoice | undefined> {
        for (const choice of ['voted', 'snoozed'] as const) {
            try {
                await readFile(join(this.directory, 'choices', `${this.choiceKey(guildId, userId, opens, choice)}.json`));
                return choice;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
        }
        return undefined;
    }

    async saveChoice(guildId: string, userId: string, opens: number, choice: ReminderChoice): Promise<void> {
        await this.writeRecord('choices', this.choiceKey(guildId, userId, opens, choice), { savedAt: new Date().toISOString() });
    }
}

export const reactionStore = new ReactionStore('data/reminder-reactions');
