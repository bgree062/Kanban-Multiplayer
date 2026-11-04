# Kanban Flow Lab — Multiplayer (separate website)

This is a **new Vite/React project**. It does **not** replace or modify the existing `kanban-flow-lab.vercel.app` website. Build and deploy it to a separate Vercel project/repository (suggested URL `kanban-flow-multiplayer.vercel.app`, subject to availability).

## What it does

- 3–5 people, on **different computers**, join one synchronized room with an eight-character code.
- The host is **Player 1** and also advances the simulation; participants choose a name and an avatar.
- Each player can act only on **their own turn**. Other browsers see the same board. Legal task choices are validated in Postgres, not just in browser JavaScript.
- Day 1–10: unlimited WIP, no DSU. Day 11–20: same board, WIP 3 and randomized DSU leader each day. Phase 3: fresh board, 10 or 20 days. On the 40-day branch the host chooses WIP 3/4 (or 5 for 5-person teams) **only at the start of Day 31**.
- An eight-avatar lobby, green eligible-card outlines, amber at WIP capacity, red when WIP exceeded, plus cumulative flow, daily throughput **lines**, lead-time histograms and percentiles.
- Final results: **Print / Save as PDF** using the browser print dialog.
- No user accounts or permanent game archive. The current live game and its day-by-day state are held in Supabase until expiry. Browser session credentials stay in `sessionStorage` (cleared when the tab is closed).

## Setup — about 15–25 minutes, once

### 1. Create a *new* GitHub repository

On GitHub choose **New repository**, e.g. `Kanban-Multiplayer`. Upload the **contents of this ZIP**, not a parent folder. The repository root must contain `package.json`, `index.html`, `src/`, `supabase/`.

Do not place these files in your existing `Kanban/kanban-flow-site` folder; this keeps the original simulator safe.

### 2. Create a Supabase project

At https://supabase.com/dashboard choose New project. In **SQL Editor → New query**, paste the contents of `supabase/setup.sql` and press **Run**. This installs temporary rooms, database-validated turn rules, and the lobby commands.

Next, open **Project Settings → API** (or **Connect → API Keys** in the current UI). Copy:

- Project URL (`https://...supabase.co`)
- Publishable (or legacy `anon`) key. **Never use the secret/service_role key in Vite.**

A room stays valid until 4 hours after its last activity. Rows are deleted by optional automated cleanup. If you need automatic removal, enable `pg_cron` in Supabase and run the optional statement at the bottom of `setup.sql`.

### 3. Deploy a *new* Vercel project

At https://vercel.com/new import `Kanban-Multiplayer` (not your original `Kanban` repository). Framework: **Vite**. Root Directory: **./** (if uploaded at repository root). Build command: `npm run build`; Output Directory: `dist`.

In **Environment Variables** create:

`VITE_SUPABASE_URL` = your Supabase project URL

`VITE_SUPABASE_ANON_KEY` = your Supabase publishable / anon key

Deploy. If you add/change variables after the first deployment, **redeploy** from Vercel.

### 4. Test with two computers

- On computer A, enter a name and avatar, choose 3 players, then **Create room**.
- Copy the invite link. On computer B, open it, enter another name and avatar, and **Join room**.
- For a 3-player room, a third browser (e.g., an incognito window) must join. The host starts after all three are present.
- Play a turn on one computer. The others should update immediately via Supabase Realtime Broadcast; a fallback refresh also runs every 5 seconds.
- At completion, click **Print / Save as PDF**. Vercel and Supabase do not maintain an exported report archive.

## Security and design notes

- Player UUID tokens, not display names, authorize actions. Server-side database functions validate turns, legal tasks, WIP limits and stage transitions.
- Supabase table access is blocked by Row Level Security; browsers use only RPC functions.
- Room codes are random eight-character hexadecimal identifiers, not passwords. **People who know the code can see the room** (but cannot take player actions without the seat token).
- Do not enter private or sensitive information into the name, notes or room fields. Room state (including transient history and DSU notes) is visible to room members and anyone with the code until expiration.
- Room data is **temporary**, not permanently archived. Enable scheduled expiry deletion if you need automatic purging; otherwise expired rows are retained until manually or automatically cleaned.
- A host leaving mid-game pauses progression. Rejoining is possible in the *same browser tab* while its sessionStorage credentials remain present. Host handoff is not part of this first release.
- The same fixed 10-day card sequence repeats across phases to support a controlled comparison; DSU selection is random each simulated day. The rules engine is shared with the original simulator in logic but is independent in source files.

## Files

- `src/main.jsx` — multiplayer UI, room synchronization, board, charts, print report.
- `src/style.css` — site design and printer stylesheet.
- `src/simulation.js` — stat calculations and legal-move descriptions.
- `supabase/setup.sql` — temporary room storage, authentication tokens, and server-validated game transitions.
- `.env.example` — variable names; never commit a real `.env` containing secrets.

## Local development

```bash
npm install
cp .env.example .env.local
# Fill in Supabase project URL and publishable / anon key
npm run dev
```
