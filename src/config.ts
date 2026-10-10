type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string): string {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function snowflake(env: Environment, name: string): string {
    const value = required(env, name);
    if (!/^[1-9]\d{16,19}$/.test(value)) {
        throw new Error(`${name} must be a Discord ID (17–20 digits).`);
    }
    return value;
}

export function loadBotConfig(env: Environment = process.env) {
    return { token: required(env, 'DISCORD_TOKEN') };
}

export function loadDeploymentConfig(env: Environment = process.env) {
    return {
        ...loadBotConfig(env),
        clientId: snowflake(env, 'CLIENT_ID'),
        guildId: snowflake(env, 'GUILD_ID'),
    };
}

export function loadReminderConfig(env: Environment = process.env) {
    return {
        guildId: snowflake(env, 'GUILD_ID'),
        roleId: snowflake(env, 'GUILD_LEADER_ROLE_ID'),
        channelId: snowflake(env, 'REMINDER_CHANNEL_ID'),
    };
}

function eveningTime(env: Environment, name: string): string {
    const value = required(env, name);
    if (!/^(1[8-9]|2[0-2]):[0-5]\d$/.test(value)) {
        throw new Error(`${name} must be an evening time between 18:00 and 22:59 (HH:MM).`);
    }
    return value;
}

export function loadScheduleConfig(env: Environment = process.env) {
    const enabled = env.REMINDERS_ENABLED?.trim() || 'false';
    if (enabled !== 'true' && enabled !== 'false') {
        throw new Error('REMINDERS_ENABLED must be true or false.');
    }
    if (enabled === 'false') return undefined;
    return {
        ...loadReminderConfig(env),
        fridayTime: eveningTime(env, 'FRIDAY_REMINDER_TIME'),
        mondayTime: eveningTime(env, 'MONDAY_REMINDER_TIME'),
    };
}
