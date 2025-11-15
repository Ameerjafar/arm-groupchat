# ARM GroupChat

A monorepo for a Solana-backed group fund and Telegram integration. This repository contains a Next.js frontend, a Bun-based backend, a Telegram bot, a Prisma/Postgres data package, UI components, and an Anchor (Solana) smart contract program.

This README explains the repository layout, prerequisites, development workflow, environment variables, and useful commands for local development (Windows PowerShell examples included).

## Tech Stack

- Monorepo managed with `turbo` and Bun workspaces
- Runtime: `bun` (project configured with `bun@1.2.22`) and Node >= 18
- Frontend: Next.js (React 19)
- Backend & Bot: Bun + TypeScript (simple HTTP API + Telegram bot using `telegraf`)
- DB: PostgreSQL + Prisma
- Smart contract: Solana Anchor (Rust)

## Repository Layout

- `apps/`
	- `backend/` - Bun TypeScript backend (Express-based controllers and Solana services)
	- `telegram-bot/` - Bun TypeScript Telegram bot (uses `telegraf`)
	- `web/` - Next.js frontend (user-facing UI)
	- `docs/` - Documentation site (Next.js)
- `packages/`
	- `db/` - Prisma schema + database client package (`@repo/db`)
	- `ui/` - React UI component library (`@repo/ui`)
	- `eslint-config/`, `typescript-config/` - shared config packages
- `contract/groupchat_fund/` - Anchor program (Solana smart contract)
- `package.json` - top-level scripts powered by `turbo`

## Quick Start (Windows PowerShell)

1. Install prerequisites (choose the tools you prefer):

	 - Install Bun (recommended):

		 ```powershell
		 iwr https://bun.sh/install -useb | iex
		 ```

	 - Ensure Node >= 18 is available (some tools may use Node). For Anchor/contract you will need Rust and Solana toolchain (see Contracts section).

	 - Install PostgreSQL (or use a hosted PostgreSQL). Create a database and get a `DATABASE_URL` connection string.

2. Install dependencies for the monorepo (root):

	 ```powershell
	 # from repository root
	 bun install
	 ```

3. Development: run all dev tasks with Turbo (root):

	 ```powershell
	 bun run dev
	 ```

	 That will run `dev` scripts in packages matching their package.json (for example: Next.js `web`, Bun `backend`, Bun `telegram-bot`).

Alternatively, run per-app locally from their folders:

- Backend (in `apps/backend`):

	```powershell
	cd apps\backend
	bun run dev
	```

- Telegram bot (in `apps/telegram-bot`):

	```powershell
	cd apps\telegram-bot
	bun run dev
	```

- Web (in `apps/web`):

	```powershell
	cd apps\web
	bun run dev
	# opens on http://localhost:3000 by default
	```

## Database (Prisma)

- The Prisma schema is in `packages/db/prisma/schema.prisma`. It expects a `DATABASE_URL` environment variable.

- Common Prisma commands (from repo root or `packages/db`):

	```powershell
	# generate client
	npx prisma generate

	# run migrations (development)
	npx prisma migrate dev --name init

	# open studio
	npx prisma studio
	```

	If using Bun exclusively, you can run `bunx prisma generate` instead of `npx`.

## Smart Contract (Anchor / Solana)

- The Anchor program is in `contract/groupchat_fund`. Building and deploying Anchor programs requires the Rust toolchain, `anchor` CLI and `solana` CLI.

- Typical commands (recommended to run in a Unix-like environment or WSL on Windows):

	```bash
	# in contract/groupchat_fund
	anchor build
	anchor deploy --provider.cluster Devnet
	```

- Note: Solana program deployment usually requires a Unix-like shell and Solana CLI setup; on Windows we recommend using WSL2 or a remote Linux environment.

## Important Environment Variables

The project uses `dotenv` in several packages. Common environment variables referenced across the codebase:

- `DATABASE_URL` - Postgres connection string used by Prisma
- `BOT_TOKEN` - Telegram bot token (used by backend & bot)
- `BACKEND_URL` - Backend API base URL (used by bot and web)
- `WEB_APP_URL` - Public URL of the web app (optional)
- `ENCRYPTION_KEY` - Hex-encoded symmetric key used to encrypt user private keys (must be provided)
- `SOLANA_RPC_URL` / `NEXT_PUBLIC_SOLANA_RPC_URL` - Solana RPC endpoint (defaults to Devnet)
- `PROGRAM_ID` - Optional override for the deployed Anchor program ID

Set these in a `.env` file in the relevant app (for example `apps/backend/.env`, `apps/telegram-bot/.env`, `packages/db/.env`) or set them via your environment.

Example `.env` (DO NOT COMMIT):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/arm_groupchat
BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
BACKEND_URL=http://localhost:5000
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
SOLANA_RPC_URL=https://api.devnet.solana.com
PROGRAM_ID=JDomJJbEK48FriJ5RVuTmgDGbNN8DLKAv33NdTydcWWd
```

## Useful Scripts (root)

- `bun run dev` - run `dev` across workspace via `turbo`
- `bun run build` - run `build` across workspace via `turbo`
- `bun run lint` - run lint across workspace via `turbo`
- `bun run format` - run Prettier formatting on repository files

You can also run scripts in each package using `bun` or `npm` from that package's folder.

## Development Notes

- The backend and bot are Bun-first projects. They use Bun's script runner and expect `bun` for the fastest experience, but most packages will also work using Node tooling and `npx` where appropriate.
- The frontend `web` and `docs` apps are Next.js projects and run on standard Next tooling (`next dev`, `next build`).
- Shared UI components live in `packages/ui` and are consumed by `apps/web` and `apps/docs`.
- Database model and relations are defined with Prisma in `packages/db`.

## User Flow (How members interact)

This section describes a typical end-user journey when using ARM GroupChat via Telegram and the web dashboard.

- **1) Join the group fund**
	- A group admin initializes a fund (via the web dashboard or bot command) with parameters like `minContribution`, `tradingFeeBps`, and `fundName`.
	- Members join by interacting with the Telegram bot or linking their wallet in the web app. The bot registers users by their Telegram ID and (optionally) wallet address.

- **2) Contribute**
	- A member sends a command to the Telegram bot (e.g. `/contribute`) or uses the web UI to start a contribution.
	- The backend returns an on-chain instruction or deposit address; the member approves the transaction with their Solana wallet (or follows instructions in the bot).
	- On success, the Anchor program mints shares proportional to the contribution and records a contribution transaction in the Prisma database.

- **3) Track fund & share balances**
	- Members can request the fund status and their share balance from the bot (e.g. `/fund_status`) or view the dashboard in the web app.
	- All contributions, transactions, and distributions are logged in the Postgres DB and optionally referenced by on-chain signatures.

- **4) Distributions / Withdrawals**
	- When a distribution is triggered (profit-only or full cashout), the backend coordinates with the Anchor program to burn shares and transfer SOL following the fund's rules.
	- The bot notifies members of completed payouts and provides transaction signatures for on-chain verification.

- **5) Security & Recovery**
	- User private keys (if stored) are encrypted with the `ENCRYPTION_KEY`; users are encouraged to manage keys locally when possible.
	- Failed syncs or on-chain errors are captured in `FailedSync` records (see Prisma schema) for retries and manual review.

## Contributing

- Please open issues or pull requests against this repository. Keep changes scoped to a package where possible.
- Follow code style (Prettier + ESLint config in `packages/*`). Use `bun run format` and `bun run lint` at root.

## License

No license specified in repository. Check with the project owner before using this code in production.

## Contact / Maintainers

If you need help understanding specific parts of the repo (backend controllers, solana services, telegram handlers), open an issue or reach out to the repository owner/maintainers.

