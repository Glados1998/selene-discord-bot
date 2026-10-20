# Production deployment

Production will run on Railway. The supplied Selene - Atreides IDs are saved in the private, Git-ignored `.env.production`. The development `.env` remains separate. Railway authentication and Discord installation/verification are still required before rollout.

## Discord installation and command access

1. In the Discord Developer Portal, select the application matching `CLIENT_ID`. Use its Guild Install link with `bot` and `applications.commands` scopes to install into Selene - Atreides.
2. In the production environment, set `GUILD_ID`, `ADMIN_ROLE_ID`, `GUILD_LEADER_ROLE_ID`, and `REMINDER_CHANNEL_ID` using IDs from Selene - Atreides. The same application/token can be used if this is the intended production bot. Keep the token in the host's secret/environment configuration, not in Git or chat.
3. Give the bot View Channel and Send Messages in the reminder channel, plus Mention Everyone there if the target role is not mentionable. The bot itself does not require Administrator permission.
4. Register the commands using the production environment (see commands below).
5. In Discord's Server Settings → Integrations → this application, explicitly allow the specific admin role to use the bot's commands. Check for per-command overrides. Commands are disabled for ordinary members by default; Discord administrators can see/use commands at the platform level, but the bot independently denies anyone without `ADMIN_ROLE_ID`, including administrators and the server owner.
6. Restart the bot after setting `ADMIN_ROLE_ID`. All commands are restricted to the configured server. `/status`, `/reminder-check`, and `/reminder-send` also require the exact admin role; `/schedule` and `/info` are public. A missing role ID prevents startup.
7. Verify `/status` and `/reminder-check` with an admin-role member. Verify members without the admin role can use `/schedule` and `/info` but cannot execute administrator commands. `/reminder-send` triggers an actual role notification, so use it only when ready for that notification.

Discord permission behavior: https://docs.discord.com/developers/interactions/application-commands#permissions

## Railway deployment

`railway.json` selects the Dockerfile, one replica, and up to ten restarts on failure. Do not configure a public domain, HTTP healthcheck, or a cron schedule: this bot is a continuously running worker. Disable Serverless/app sleeping in the service settings.

1. Authenticate locally with `railway login` and select or create the intended Railway project/service. Review the account plan and usage charges before deploying.
2. Add a persistent volume mounted at `/app/data` before enabling reminders. Keep it attached through redeployments.
3. Set `RAILWAY_RUN_UID=0` on the service, as required by Railway's documented volume permissions for this image. Railway mounts volumes as root; the image otherwise defaults to the unprivileged node user.
4. Import the values from `.env.production` into the service variables using the dashboard or a secure local CLI workflow. Do not commit or include that file in the image. Leave `REMINDERS_ENABLED=false` during initial verification.
5. Deploy the source with Railway's CLI or a connected Git repository. Uncommitted local changes must be included if using CLI upload; a Git deployment requires the prepared changes to be committed and pushed first.
6. Register the production commands locally with `DOTENV_CONFIG_PATH=.env.production npm run deploy`. This uses the production server IDs and does not start the scheduler.
7. Verify the Discord integration permissions and `/reminder-check`. Verify write access to `/app/data/reminder-deliveries` in the deployed container before enabling scheduling.
8. Stop any other bot instance for this application, set Railway's `REMINDERS_ENABLED=true`, and redeploy. Confirm the ready and schedule logs. Keep the volume and verify the first scheduled notification.

Railway's deployment status alone does not prove a successful Discord connection; inspect logs and run the Discord check. If ten restart attempts are exhausted, inspect the failure and restart manually after correcting it.

References: [Dockerfiles](https://docs.railway.com/builds/dockerfiles), [volumes and permissions](https://docs.railway.com/volumes), [configuration reference](https://docs.railway.com/config-as-code/reference).

## Alternative: Docker Compose hosting

Use a continuously running worker/container, one instance, with persistent storage mounted at `/app/data`. No incoming port or public web endpoint is required. The platform must allow outbound HTTPS and Discord Gateway WebSocket connections. Set the restart policy to restart failed processes. The bot cannot run as a request-only serverless function.

The Docker image builds and tests TypeScript, removes development dependencies, and runs as the unprivileged `node` user. The build context excludes local secrets and delivery state. The Compose file supplies restart behavior, bounded logs, and a persistent named volume.

On a Docker Compose host, place production settings in a private `.env` file alongside `compose.yaml`:

```sh
docker compose build
docker compose run --rm --no-deps bot node dist/deploy-commands.js
```

Command registration replaces this application's complete command list in the configured guild. Confirm the target IDs before running it.

Stop the development bot before enabling production reminders. If moving existing delivery claims for the same guild, copy `data/reminder-deliveries/` into the production volume before starting; local test-guild claims are not needed for a different guild.

```sh
docker compose up -d
docker compose logs --tail=100 -f bot
```

For a host without containers, use Node.js 22.18 or later, run `npm ci`, `npm test`, `npm run build`, and `npm run deploy`, then run `npm start` under the host's process supervisor with the repository root as its working directory. Preserve the `data/` directory. Keep only one instance running.

## Verification and updates

- Confirm the startup log shows the bot identity and Friday 20:00, Sunday 21:00, Monday 20:00, Europe/Amsterdam (or the configured preparation/final reminder times).
- Check the correct guild leader role and reminder channel with `/reminder-check`.
- Confirm the first automatic reminder at its scheduled time.
- Retain the persistent volume when updating; do not run `docker compose down -v` unless intentionally deleting delivery history.
- For updates, build the image, register commands if definitions changed, then run `docker compose up -d`. Preserve the environment and volume.

Delivery claims prevent repeat attempts, but a failed/uncertain delivery is not retried automatically. Review logs and the channel before sending a manual fallback. Hosts and storage do not automatically migrate from the development machine.


### Personal reminder rollout

Register `/voting-status` and `/reminder` with the complete command registry and allow guild leaders to invoke them in server integration settings. Runtime checks still require the exact guild leader role. Preserve `/app/data/voting-state.json` alongside delivery claims on the existing volume. Enable **Server Members Intent** in the Discord Developer Portal before deploying. Personal reminders default to enabled for newly discovered leaders; `/reminder enabled:false` disables them. The complete roster refreshes on startup and every five minutes without replacing individual preferences. Existing saved disabled preferences are retained. Test with one consenting leader whose server DMs are enabled: verify the private command response, the next scheduled DM approximately ten minutes after its community announcement, both buttons, and next-cycle cleanup. Community announcements no longer mention the leader role or require Mention Everyone permissions. Manual `/reminder-send` sends only the community announcement.
