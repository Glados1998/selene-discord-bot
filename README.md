# Selene Discord bot

Selene will remind members of **Selene - Atreides** with the **guild leader** role to vote on Landsraad decrees in **Dune: Awakening**.

The bot provides `/ping` and an administrator setup check, `/reminder-check`. Reminder scheduling and persistent reminder state will be added incrementally.

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

This replaces the application's complete guild command list in `GUILD_ID` with the commands defined in this project. Currently that list contains `/ping` and `/reminder-check`. Registration is separate from bot startup.

After starting the bot, look for `Logged in as ...`, then invoke `/ping` in the configured server. The expected response is `Pong!`. Stop with Ctrl+C; SIGINT and SIGTERM close the Discord client.

## Code layout

- `src/config.ts`: environment validation; no Discord connections.
- `src/index.ts`: startup, login, and shutdown.
- `src/bot.ts`: client construction and event handling.
- `src/commands/`: command definitions and execution, shared by the bot and registration script.
- `src/deploy-commands.ts`: guild command registration.
- `tests/`: local configuration, interaction, and failure-path checks with no Discord traffic.

Startup and registration failures return a nonzero exit code. Command failures are logged without terminating the bot; a failed Discord reply may leave the user without a response.

## Check the reminder target

Add these values to your existing `.env` (leave the token and existing IDs intact):

```dotenv
GUILD_LEADER_ROLE_ID=your_role_id
REMINDER_CHANNEL_ID=your_channel_id
```

With Discord Developer Mode enabled, copy the ID of the **guild leader** role and the ID of the text channel intended for reminders. IDs keep the configuration stable when names change. `GUILD_ID` must identify Selene - Atreides.

Run `npm run deploy` to register the new command, then restart development mode or run `npm run build` and `npm start`. Run `/reminder-check` as a member with **Manage Server** permission in the configured server.

The check validates that the role exists and is not @everyone, the channel is a server text channel, and the bot can view and send messages there. The role must be mentionable, or the bot must have Mention Everyone in that channel. Replies are private and disable mentions: checking setup does not notify guild leaders or send a reminder.

Reminder configuration is validated when this command runs, so `/ping` remains available while setup is incomplete. The reusable target resolver lives in `src/reminders/target.ts`; future reminder delivery will use it too.
