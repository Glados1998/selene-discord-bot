/** Single registry used for both Discord registration and runtime dispatch. */
import { status } from './status.js';
import { reminderCheck } from './reminder-check.js';
import { reminderSend } from './reminder-send.js';
import { schedule } from './schedule.js';
import { info } from './info.js';
import { votingStatus, reminderPreference } from './voting.js';

export const commands = [
    ...[status, reminderCheck, reminderSend].map(command => ({ ...command, access: 'admin' as const })),
    ...[schedule, info, votingStatus, reminderPreference].map(command => ({ ...command, access: 'public' as const })),
];
