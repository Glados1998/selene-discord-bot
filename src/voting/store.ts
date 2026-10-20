import { mkdir, readFile, rename, open } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface Leader {
    enabled: boolean;
    active?: boolean;
    cycle?: string;
    voted?: boolean;
    snoozed?: string;
    messages: { id: string; channelId: string; cycle: string }[];
}
export interface Job { cycle: string; slot: string; due: number; closes: number }
export interface VotingState {
    leaders: Record<string, Leader>;
    jobs: Record<string, Job>;
    claims: Record<string, boolean>;
}

/** One process, serialized transactions and atomic replacement; never silently reset corrupt state. */
export class VotingStore {
    private tail: Promise<unknown> = Promise.resolve();
    constructor(private readonly path: string) {}
    transaction<T>(action: (state: VotingState, save: () => Promise<void>) => Promise<T>): Promise<T> {
        const task = this.tail.then(async () => {
            let state: VotingState;
            try {
                state = JSON.parse(await readFile(this.path, 'utf8')) as VotingState;
                if (!state.leaders || !state.jobs || !state.claims) throw new Error('Invalid voting state');
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                state = { leaders: {}, jobs: {}, claims: {} };
            }
            const save = async () => {
                await mkdir(dirname(this.path), { recursive: true });
                const file = await open(`${this.path}.tmp`, 'w', 0o600);
                try {
                    await file.writeFile(JSON.stringify(state));
                    await file.sync();
                } finally { await file.close(); }
                await rename(`${this.path}.tmp`, this.path);
            };
            return action(state, save);
        });
        this.tail = task.catch(() => {});
        return task;
    }
}
