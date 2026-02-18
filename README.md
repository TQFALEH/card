# Neon Memory Match Online

Realtime Memory Match with:
- React + Vite + GSAP frontend (`/client`)
- Supabase Auth + Postgres + Realtime backend (`/supabase/migrations`)
- Netlify deployment for frontend

## New Social + History Layer

Implemented:
- Friends system (search by username, send request, accept/reject/block, pending states)
- Realtime invitations with expiry (accept/reject, private room creation)
- Friends presence (`online`, `offline`, `in_lobby`, `in_match`) using Supabase Presence + durable `user_presence`
- Full match history persisted at match end
- Match details panel + filters (board size, win/loss)
- Stats aggregation per user (wins/losses/win_rate/streak/avg duration)

## Project Structure

- `client/`: app UI + realtime logic
- `client/src/pages/FriendsPage.tsx`: friends and requests UI
- `client/src/pages/HistoryPage.tsx`: match history + details
- `client/src/components/InviteInbox.tsx`: realtime invite modal (accept/reject)
- `client/src/contexts/PresenceContext.tsx`: global presence tracking + heartbeat
- `client/src/lib/social.ts`: friends/invites/history/presence API layer
- `supabase/migrations/`: SQL schema + RLS + RPCs

## Migrations

Apply all migrations in order. Latest includes social/history system:
- `2026021802_rematch.sql`
- `2026021803_rpc_hotfix.sql`
- `2026021804_rls_and_rpc_fix.sql`
- `2026021805_gameplay_rpc_full_fix.sql`
- `2026021806_ambiguous_state_fix.sql`
- `2026021807_reapply_rpc_ambiguity_fix.sql`
- `2026021808_avatar_storage.sql`
- `2026021809_social_history_system.sql`

Or run with Supabase CLI:

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

## Environment

Create `client/.env` from `client/.env.example`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_APP_URL=http://localhost:5173
```

## Local Run

```bash
cd client
npm install
npm run dev
```

## Deploy (Netlify)

- Base dir: `client`
- Build: `npm run build`
- Publish: `dist`
- Env vars: same `VITE_*` values above

## Realtime Architecture

### Presence
- Global channel: `presence:global`
- Client tracks user presence metadata (`status`, `room_id`)
- Durable backup in DB via `set_presence` RPC (`user_presence` table)

### Friends
- Table: `friends`
- RPCs: `send_friend_request`, `respond_friend_request`, `cancel_friend_request`
- Realtime updates through Postgres changes + private channel `friends:<userId>`

### Invitations
- Table: `invitations`
- RPCs: `create_invitation`, `respond_invitation`, `cancel_invitation`, `expire_invitations`
- Accept creates private room (`rooms.is_private = true`, `invited_user_id`)
- Realtime updates through Postgres changes + private channel `invites:<userId>`

### Match History
- Match ends in room engine (`state_json.status = ended`)
- Client calls `finalize_match(room_id)` once ended
- Function writes `matches` row and updates `stats` atomically/idempotently

## Security / RLS

Implemented policies:
- `profiles`: authenticated read, owner write
- `friends`: only involved users can read/update; requester insert pending
- `invitations`: only sender/receiver can read/update; sender insert
- `matches`: only users in `players_json` can read
- `user_presence`: authenticated read, owner write
- `realtime.messages`: scoped policies for `invites:*`, `friends:*`, and `presence:global`

