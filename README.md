# Selene Discord bot

Selene will remind members of **Selene - Atreides** with the **guild leader** role to vote on Landsraad decrees in **Dune: Awakening**.

This first step provides a validated startup flow and a `/ping` command. Role targeting, reminder scheduling, and persistent reminder state will be added incrementally.

## Requirements

- Node.js 22.18 or later and npm.
- A Discord application with a bot installed in your server, authorized with the `bot` and `applications.commands` scopes.
- Access to a server channel where you can invoke the bot's commands.

The bot currently requests only the Guilds intent; no privileged intents are needed for `/ping`.

## Setup

```sh
npm ci
cp .env.example .env
```

If `.env` already exists, edit it instead of copying over it. Fill in:

| Variable | Value | Used by |
| --- | --- | --- |
| `DISCORD_TOKEN` | Bot token from the Discord Developer Portal | Bot and command registration |
| `CLIENT_ID` | Application ID from the Developer Portal | Command registration |
| `GUILD_ID` | Selene - Atreides server ID (Copy Server ID with Discord Developer Mode enabled) | Command registration |

Keep the token private. `.env` and local environment variants are ignored by Git. Configuration errors identify the variable without printing its value.

Run commands from the project root so dotenv can find `.env`.

## Validate and run

```sh
npm run typecheck
npm test
npm run build
npm start
```

For development, use `npm run dev` to restart automatically when source files change. `npm start` uses compiled files in `dist`, so rebuild after source changes.

Register slash commands once before trying `/ping`, and repeat when command definitions change:

```sh
npm run deploy
```

This replaces the application's complete guild command list in `GUILD_ID` with the commands defined in this project. Currently that list contains only `/ping`. Registration is separate from bot startup.

After starting the bot, look for `Logged in as ...`, then invoke `/ping` in the configured server. The expected response is `Pong!`. Stop with Ctrl+C; SIGINT and SIGTERM close the Discord client.

## Code layout

- `src/config.ts`: environment validation; no Discord connections.
- `src/index.ts`: startup, login, and shutdown.
- `src/bot.ts`: client construction and event handling.
- `src/commands/`: command definitions and execution, shared by the bot and registration script.
- `src/deploy-commands.ts`: guild command registration.
- `tests/`: local configuration, interaction, and failure-path checks with no Discord traffic.

Startup and registration failures return a nonzero exit code. Command failures are logged without terminating the bot; a failed Discord reply may leave the user without a response.
