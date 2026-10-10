# Security review — 2026-10-11

## Scope and results

Reviewed command authorization, Discord mention restrictions, configuration, delivery state, command errors, container configuration, and locked npm dependencies. This is a focused code review, not a penetration test or a guarantee of future security.

- Live `npm audit --json`: zero known vulnerabilities in the audited dependency graph, including development dependencies.
- Exact configured bot-token matching across reachable Git history: no matches. This is not a general secret scanner and cannot detect old rotated credentials or unknown secrets.
- `.env` and `.env.production` are excluded from Git; only `.env.example` is tracked. Docker uses an allowlisted build context.
- Every command passes one runtime check for the configured guild and exact admin role. Administrator permission alone does not bypass it; missing members, DMs, and other guilds are denied. Tests cover raw and cached member representations.
- Reminder payloads allow only the configured role mention; users and @everyone are not parsed. Status responses are private and suppress mentions.
- Delivery keys reject path traversal. Exclusive file creation prevents concurrent duplicate claims, and claim files use owner-only permissions.
- No user-controlled shell execution or arbitrary URL fetching was found in application code.

## Required credential action

During this review, a local audit command error printed the current Discord token into the chat tool log. Reset it in the Discord Developer Portal and replace DISCORD_TOKEN in the private local environment files and Railway variables. Never paste the replacement into chat. The token is not reproduced in this document. This exposure happened in the review tooling, not in committed application code.

## Remaining operational risks

- Railway currently overrides the container user with RAILWAY_RUN_UID=0 for volume access. The bot consequently runs as root inside its container. A compromised runtime would have greater access within that container; this review did not redesign Railway volume ownership or scan OS packages in the container image.
- Manual reminders have a concurrency lock, not a persistent rate limit. A compromised or abusive admin-role account can send repeated notifications. Protect membership of that role and the hosting account.
- Delivery uses at-most-one attempt, not guaranteed delivery. A crash after claiming or an ambiguous Discord failure may skip a reminder. Inspect logs/channel before manual recovery.
- Keep exactly one production instance and its persistent volume. Do not simultaneously run a development bot using the same credentials.
- `/status` reports current prerequisites and configuration, not proof the scheduler has delivered messages successfully. Verify real scheduled delivery separately.
- Repeat dependency auditing after updates; npm advisory results can change.

## Validation

TypeScript checking, production build, and all 20 local tests passed, including private status output, degraded checks, and authorization regression tests. No public test reminder was sent. This turn did not deploy or register the renamed command; rotate the credential before production rollout.
