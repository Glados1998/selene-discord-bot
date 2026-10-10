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
