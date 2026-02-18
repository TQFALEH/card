# Neon Memory Match Online (Netlify + Supabase)

This repo upgrades Memory Match into a full realtime online multiplayer game using:

- Frontend: React + Vite + GSAP (`/client`)
- Backend: Supabase Postgres + Auth + Realtime (Broadcast + Presence)
- Deployment target: Netlify (frontend) + Supabase (backend)

## Project Structure

- `client/`: React application (auth, lobby, invite links, online game, profile)
- `supabase/migrations/20260218_memory_online.sql`: schema + RLS + authoritative RPC functions
- `supabase/migrations/20260218_rematch.sql`: same-room rematch RPC
- `netlify.toml`: Netlify build config

## Features Implemented

- Supabase Auth: signup/login/logout + persistent session
- Protected routes for online gameplay
- Realtime room system with invite links (`/join/:roomId`)
- Lobby with player list, ready state, auto start when both ready
- Realtime Presence for online/offline tracking
- Realtime Broadcast for room/game events
- Authoritative canonical room state in DB (`room_state`) with version checks
- Server-validated actions via RPCs:
  - `room_flip_card`
  - `resolve_pending`
  - plus room lifecycle functions (`create_room`, `join_room`, `set_player_ready`, `start_room_if_ready`)
- GSAP animations preserved for card flip/match/mismatch feel
- Reconnect handling with overlay + resync
- Same-room rematch flow (`rematch_room`) resets room to lobby for instant replay
- GSAP room-state transitions + animated neon toasts
- Profile page with editable username + stats
- Backend-driven dynamic config (`board_sizes`, `themes`)

## Supabase Setup

1. Create a Supabase project.
2. In SQL Editor, run migration:
   - `supabase/migrations/20260218_memory_online.sql`
   - `supabase/migrations/20260218_rematch.sql`
3. In Supabase Realtime settings:
   - Ensure Broadcast + Presence are enabled.
4. In Authentication:
   - Enable Email provider.

## Client Environment

Create `client/.env` from `client/.env.example`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_APP_URL=http://localhost:5173
```

## Run Locally

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173` in two browsers/devices and test invite flow.

## Deploy to Netlify

1. Push repo to GitHub.
2. Create new Netlify site from this repo.
3. Build settings (already in `netlify.toml`):
   - Base directory: `client`
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Add Netlify environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_URL` (your Netlify URL)

## Realtime Flow (Presence + Broadcast + DB)

1. **Canonical state** lives in `room_state.state_json` with `version`.
2. Client action (`flip`) calls RPC `room_flip_card(room_id, card_index, expected_version)`.
3. RPC locks row (`FOR UPDATE`), validates turn/card/input lock, applies state transition, increments version.
4. Client broadcasts `state_updated` event to room channel.
5. Other clients receive event and fetch latest canonical state.
6. For mismatch/match resolve timing, clients call `resolve_pending` after `resolve_after`; function validates version and finalizes safely.
7. Presence tracks connected users and ready statuses in room channel.

This optimistic-concurrency + locked-row pattern prevents double-write races and invalid out-of-turn mutations.

## Security

Migration includes RLS policies for:

- Room data accessible only to room members
- Room creation only by authenticated users
- Room state and match inserts restricted to members
- Realtime channel authorization for `room:<roomId>` topics via `realtime.messages` policies

## Notes

- The authoritative functions are designed to be server-validated and race-safe without custom websocket servers.
- Netlify hosts frontend only; Supabase handles realtime websocket infrastructure.
