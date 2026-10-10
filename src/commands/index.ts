/** Single registry used for both Discord registration and runtime dispatch. */
import { status } from './status.js';
import { reminderCheck } from './reminder-check.js';
import { reminderSend } from './reminder-send.js';

export const commands = [status, reminderCheck, reminderSend];
