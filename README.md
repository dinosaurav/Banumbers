# Banumbers 🍌

A multiplayer party game about numbers, guts, and the hyperinflationary macroeconomics of bananas. 2–8 players, room codes, phone-friendly, lots of flying bananas.

## Rules

- Everyone starts with **10 bananas**; the crate starts with **10 bananas**.
- Each round, everyone secretly writes a number from **1 to a bananillion** (1,000,000,000).
- The **highest number takes the whole crate**, then pays a **tariff** of `their number − second-highest number` to the second-highest player.
- Can't cover the tariff with stash + crate? **Banana bust**: your stash drops to 0 and the crate passes to the next-highest player, who runs the same check against the player below them, and so on. The lowest bidder has nobody below them, so their tariff is 0.
- Players who **tie** for the top spot split the crate and pay no tariff.
- After every round the crate refills to match the **richest stash** at the table.
- **First to 200 wins** (configurable).

House rules for the cases the reel didn't cover: a tied group of tariff recipients splits the tariff (remainder to the earliest seat); leftover bananas from uneven splits are lost to inflation; players who don't bid before the timer automatically bid 1; if every stash hits 0 the crate re-seeds to its starting size; if several players cross the target in the same round, the richest wins (exact tie → shared win).

## Architecture

| Layer | Tech | Why |
|---|---|---|
| Realtime game server | **Cloudflare Durable Object** (`GameRoom`), one per room, WebSocket Hibernation API | Single-threaded authoritative state per room, persists across restarts, costs ~nothing while idle |
| HTTP/API + static hosting | **Cloudflare Worker** + Workers Static Assets | Same deployable; `/api/*` hits the Worker, everything else is the SPA |
| Frontend | React 19 + Vite + `motion` + `canvas-confetti` | Fun animations, tiny bundle |
| Rules engine | `src/shared/game.ts` (pure functions, unit tested) | Shared by server and client, deterministic |

```
src/
  shared/    types.ts, game.ts (rules), avatars.ts        — shared by client & worker
  worker/    index.ts (router), room.ts (Durable Object)
  client/    React app: Home → Lobby → Game (bidding / reveal playback / finished)
test/        vitest unit tests for the rules engine
```

**Protocol.** Clients open `wss://<host>/api/rooms/<CODE>/ws`, send `join` with a private per-browser token (so refreshes/reconnects restore the same seat), and receive full `state` snapshots. Bids are stored server-side and only `hasBid` is broadcast until the round resolves; the resolution (`RoundResult`) is then sent to everyone and each client plays it back as an animated timeline (reveal lowest→highest, crate flies to the winner, tariff flies to second place, bust stamps, refill).

**Timers.** The Durable Object alarm resolves the round when the bid timer expires (absent players auto-bid 1) and deletes abandoned rooms after 6 hours with no connections.

## Local development

```bash
npm install
npm run dev          # Vite + Workers runtime (Durable Objects included) on http://localhost:5173
npm test             # rules engine unit tests
npm run typecheck    # client + worker
```

Open the URL in two browsers (or a normal + private window — identity is per-browser `localStorage`) to play against yourself.

## Deploying to your personal site

```bash
npx wrangler login
npm run deploy       # builds and deploys to <name>.<your-subdomain>.workers.dev
```

To serve it from your own domain (the domain must be on Cloudflare), uncomment and edit the `routes` block in `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "banumbers.yourdomain.com", "custom_domain": true }]
```

then run `npm run deploy` again. A dedicated subdomain is the simplest option; the app is built to be served from the root of a host. Linking to it from your existing site is just an `<a href="https://banumbers.yourdomain.com">`.

Notes:

- Wrangler is pinned to `4.86.x` because newer releases require Node.js 22+. If you upgrade Node, `npm i -D wrangler@latest` is safe.
- Durable Objects require the Workers **Paid** plan ($5/mo) — SQLite-backed DOs also have a free-tier allowance; check the current Cloudflare pricing page.
- Deploying new code disconnects live WebSockets; clients reconnect automatically and rejoin their seat.
- `npm run cf-typegen` regenerates `worker-configuration.d.ts` after changing `wrangler.jsonc`.

## Room lifecycle

`POST /api/rooms` → `{ code }` (4 unambiguous letters) → players visit `/room/CODE`. The host (first player in) controls settings, start, kick, next round, and play-again; if the host is disconnected, any connected player can act as host. Late joiners during a game are told to wait for the next one.
