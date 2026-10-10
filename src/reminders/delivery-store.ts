import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';

// Exclusive file creation is the durable claim. Existing claims are never retried:
// Discord may have accepted a message even if the response was lost.
export class DeliveryStore {
    constructor(private readonly directory: string) {}

    async claim(key: string): Promise<boolean> {
        if (!/^[a-zA-Z0-9-]+$/.test(key)) throw new Error('Invalid reminder delivery key.');
        await mkdir(this.directory, { recursive: true });
        let file;
        try {
            file = await open(join(this.directory, `${key}.json`), 'wx', 0o600);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
            throw error;
        }
        try {
            await file.writeFile(JSON.stringify({ claimedAt: new Date().toISOString() }) + '\n');
            await file.sync();
        } finally {
            await file.close();
        }
        return true;
    }
}
