# RoleLens MVP (Pages Mode)

RoleLens is a personal frontend-job tracking app focused on manual capture, structured storage, analysis, and status tracking.

This branch is configured for **Cloudflare Pages deployment** (`rolelens.pages.dev`).

## Current Architecture (Pages-compatible)

- Next.js 15 + App Router
- TypeScript + Tailwind CSS
- Client-side local persistence (`localStorage`)
- TanStack Table + Recharts

Why this mode exists:
- Cloudflare Pages + `next-on-pages` is Edge-runtime oriented.
- To ensure stable Pages deployment, this mode avoids Node-only server runtime patterns.

## Features

1. Save job posting (manual input + URL + text)
2. List page with search/filter/sort
3. Detail page with notes and status updates
4. Dashboard analytics (skills/source/remote/seniority)
5. Status tracking pipeline:
   - `SAVED`
   - `REVIEWING`
   - `READY_TO_APPLY`
   - `APPLIED`
   - `INTERVIEW`
   - `REJECTED`
   - `CLOSED`

## Important Tradeoff

- Data is stored in browser localStorage in this mode.
- Data is device/browser specific.
- Clearing browser storage removes saved postings.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - local dev
- `npm run build` - production build
- `npm run lint` - lint
- `npm run cf:build` - Cloudflare Pages output build
- `npm run cf:deploy` - deploy to Cloudflare Pages

## Cloudflare Pages Deployment

Workflow: `.github/workflows/deploy-cloudflare.yml`

Required GitHub Secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PROJECT_NAME`

Deploy target should be your Pages project, e.g. `rolelens`.

Important:
- `CLOUDFLARE_PROJECT_NAME` must match the Cloudflare Pages project name.
- If your project URL is `https://rolelens.pages.dev`, project name should be `rolelens`.

## Project Structure

```text
app/
  page.tsx                # list page (client-driven)
  jobs/new/page.tsx       # save form
  jobs/page.tsx           # detail page via ?id=
  dashboard/page.tsx      # analytics dashboard

components/
  jobs/*                  # form/table/detail clients
  dashboard/*             # chart clients
  ui/*                    # UI primitives

lib/
  local-jobs.ts           # localStorage data layer
  fit-score.ts            # score + skill extraction
  validators.ts           # zod forms
```

## Next Step (if you want DB-backed production)

If you want persistent cloud DB + multi-device sync, switch to Workers/OpenNext mode again (or migrate to an Edge-compatible DB/data access strategy).
