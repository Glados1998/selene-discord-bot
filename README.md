# Selene Discord bot

Selene will remind members of **Selene - Atreides** with the **guild leader** role to vote on Landsraad decrees in **Dune: Awakening**.

The bot provides public `/schedule` and `/info` commands, an administrator-only `/status`, an administrator setup check (`/reminder-check`), and manual reminder delivery (`/reminder-send`). Automatic weekly reminders use Europe/Amsterdam time and persistent delivery claims to prevent repeats after restarts.

## Requirements

- Node.js 22.18 or later and npm.
- A Discord application with a bot installed in your server, authorized with the `bot` and `applications.commands` scopes.
- Access to a server channel where you can invoke the bot's commands.

Enable **Server Members Intent** in Discord Developer Portal → Bot before starting this version. The bot requests Guilds and GuildMembers to fetch the full leader roster.

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
| `GUILD_ID` | Selene - Atreides server ID (Copy Server ID with Discord Developer Mode enabled) | Bot and command registration |
| `ADMIN_ROLE_ID` | Exact admin role ID from the configured server | Access to administrator commands |

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

Register slash commands once before trying `/status`, and repeat when command definitions change:

```sh
npm run deploy
```

This replaces the application's complete guild command list in `GUILD_ID` with the commands defined in this project. Currently that list contains `/schedule`, `/info`, `/status`, `/reminder-check`, and `/reminder-send`. Registration is separate from bot startup.

After starting the bot, look for `Logged in as ...`, then invoke `/status` in the configured server. The private response reports connection readiness, uptime, latency, configured schedule, reminder permissions, and storage writability. It does not send a reminder or prove message delivery. Stop with Ctrl+C; SIGINT and SIGTERM close the Discord client.

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
```

With Discord Developer Mode enabled, copy the ID of the **guild leader** role. The old `REMINDER_CHANNEL_ID` is no longer used. IDs keep the configuration stable when names change. `GUILD_ID` must identify Selene - Atreides.

Run `npm run deploy` to register the new command, then restart development mode or run `npm run build` and `npm start`. Run `/reminder-check` as a member with the configured **admin role** in the configured server.

The check validates the role and fetches all members to count human leaders. It does not send DMs or prove their privacy settings allow delivery. No channel permissions or role mention permissions are required for DM delivery.

With scheduling disabled, reminder configuration is validated when this command runs, so `/status` remains available while setup is incomplete. Enabling scheduling makes reminder configuration required at startup. The reusable target resolver lives in `src/reminders/target.ts` and is also used by manual and scheduled delivery.

## Send a manual reminder

Register the updated command list with `npm run deploy`, then restart the bot (run `npm run build` first if using `npm start`). As a member with the configured **admin role**, run `/reminder-send` in the configured server.

`/reminder-send test:true` sends a clearly labelled opening-message preview only to the invoking admin, even outside voting hours. It does not fetch the leader roster or record a delivery claim. Use this first to check the wording and your DM privacy settings.

`/reminder-send` sends a personal DM to every human member with `GUILD_LEADER_ROLE_ID`, using their server display name. It works only during the scheduled Sunday 21:00–Tuesday 06:00 voting window. It sends no channel messages or role pings. The private response reports sent, already-attempted, and failed/uncertain counts; logs identify failed recipients.

Manual and automatic opening reminders share a persistent per-recipient, per-cycle claim. Repeated commands skip previous attempts; preparation and final reminders have separate claims. Blocked DMs do not stop delivery to other leaders. Failed or uncertain attempts remain claimed and are not retried, because Discord might have accepted the message. The bot does not track votes or query the game outcome.

`src/reminders/send.ts` owns message construction and delivery, shared by manual and scheduled reminders.

## Automatic weekly reminders

The agreed schedule uses **Europe/Amsterdam**, including daylight saving changes:

| Day | Local time | Message |
| --- | --- | --- |
| Friday | 20:00 | Begin discussion or review prior decisions to prepare for voting |
| Sunday | 21:00 | Announce the scheduled voting window and ask members to check the outcome |
| Monday | 20:00 | Final reminder before voting closes Tuesday at 06:00 |

Voting runs from Sunday 21:00 to Tuesday 06:00 in Europe/Amsterdam, following daylight saving changes. `/schedule` and reminder messages use Discord timestamps so each reader sees their local date/time and a relative countdown. `/schedule` shows the current window until closing, then the next window; preparation shows its next occurrence.

`MONDAY_REMINDER_TIME` defaults to `20:00` and accepts times from `18:00` through `22:59`. The previously introduced `TUESDAY_REMINDER_TIME` is ignored. Update hosting variables when deploying.

These reminders repeat every week and follow the configured timetable. Wording is conditional: Atreides may lose to the Harkonnen, so members are asked to check the outcome and vote only if voting is available to us. The bot does not query the game to determine the winner, confirm that polls opened, or retrieve previous discussions.

```dotenv
REMINDERS_ENABLED=true
FRIDAY_REMINDER_TIME=20:00
MONDAY_REMINDER_TIME=20:00
```

The example environment file leaves automatic sending disabled for new installations. In this project's local `.env`, the agreed schedule has been enabled. Rebuild and restart the bot to load changes, or restart `npm run dev` after editing `.env`. `/reminder-check` displays the configured schedule. No new command registration is needed for scheduling if the current commands are already registered.

The bot must remain running on a machine with network access. Scheduling runs inside this bot, checks every 30 seconds, and waits for a ready Discord connection. A restart can catch up for up to one hour after the scheduled time; older reminders are skipped. This does not create an operating-system service or keep a sleeping computer awake.

Delivery claims are stored in `data/reminder-deliveries/`, excluded from Git. Keep this directory across restarts and deployments, and use one running bot instance. A claim is written **before** contacting Discord. This prevents repeat attempts after restarts, including when Discord's response is lost, but a crash or delivery failure after the claim may leave that reminder unsent. Failed attempts are logged and are not automatically retried. Review DM delivery logs before using `/reminder-send`; previous recipient attempts remain skipped. Removing claims can cause duplicate notifications.

The modules are deliberately separate: `schedule.ts` determines what is due, `scheduler.ts` coordinates polling and delivery, and `delivery-store.ts` persists claims. Local tests cover summer/winter time, daylight saving transitions, missed windows, duplicate claims, restarts, offline clients, and storage/delivery failures.

## Production and command permissions

The public `/schedule` and `/info` commands are available to all members of `GUILD_ID` without pinging anyone. Both reply privately, visible only to the person who invoked the command. `/schedule` shows the voting window and configured reminder times, or indicates that automatic reminders are disabled. `/info` explains the Herald and lists the public commands. Both commands reject DMs and other servers.

The administrator commands `/status`, `/reminder-check`, and `/reminder-send` require membership in the exact role identified by `ADMIN_ROLE_ID` in `GUILD_ID`. Discord Administrator permission alone is not sufficient. Set this required variable before restarting the updated bot; there is no fallback to a role name or a broader permission.

Run `npm run deploy` after this permissions change. In Discord's server integration settings, allow the admin role to use the administrator commands. Ensure server integration permissions allow everyone to use `/schedule` and `/info`. Discord's defaults restrict visibility, and the bot enforces role membership again when a command is invoked.

See [the production deployment guide](docs/production.md) for installation into Selene - Atreides, hosting configuration, persistent storage, and rollout verification.
