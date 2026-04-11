# RoleLens MVP

RoleLens is a personal web app for frontend job hunting in Canada.
It prioritizes practical MVP workflows: save job postings, structure data, analyze demand signals, and track application status.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Supabase Postgres (or any PostgreSQL)
- Prisma
- Zod + React Hook Form
- TanStack Table
- Recharts

## MVP Features

1. Save job posting (manual input + URL + raw text)
2. List page with search/filter/sort and status view
3. Job detail page with notes, extracted skills, fit score, status updates
4. Dashboard analytics (skills, source, remote type, seniority)
5. Application status tracker:
   - `SAVED`
   - `REVIEWING`
   - `READY_TO_APPLY`
   - `APPLIED`
   - `INTERVIEW`
   - `REJECTED`
   - `CLOSED`

## Local Setup

1) Install dependencies

```bash
npm install
```

2) Configure environment

```bash
cp .env.example .env
```

Set `DATABASE_URL` to your PostgreSQL/Supabase connection string.

3) Generate Prisma client and sync schema

```bash
npm run db:generate
npm run db:push
```

4) Seed sample data

```bash
npm run db:seed
```

5) Run app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Available Commands

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run lint` - lint
- `npm run db:generate` - generate Prisma client
- `npm run db:push` - sync Prisma schema to DB
- `npm run db:seed` - seed sample data
- `npm run cf:build` - build OpenNext output for Cloudflare Workers
- `npm run cf:preview` - local preview in Cloudflare runtime
- `npm run cf:deploy` - deploy to Cloudflare Workers

## Cloudflare Workers Deployment + GitHub Actions

This repo includes two workflows:

- `.github/workflows/ci.yml`
  - Runs on PR and push to `main`
  - Executes `db:generate`, `lint`, `build`
- `.github/workflows/deploy-cloudflare.yml`
  - Runs on push to `main` (and manual trigger)
  - Builds OpenNext output and deploys to Cloudflare Workers

### Required GitHub Secrets

Set the following in your repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `DATABASE_URL`

### Recommended Cloudflare Setup

1. Create a Cloudflare Workers service with the same name as `wrangler.jsonc` (`rolelens`).
2. Use `main` as production branch and let GitHub Actions run deployment.
3. Store `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `DATABASE_URL` in GitHub Secrets.
4. Keep runtime secrets synchronized in Cloudflare dashboard as needed.

## Project Structure

```text
app/
  dashboard/page.tsx        # analytics dashboard
  jobs/new/page.tsx         # save posting form
  jobs/[id]/page.tsx        # job detail + notes + status update
  api/jobs/route.ts         # POST create job
  page.tsx                  # listing/search/filter

actions/
  jobs.ts                   # server actions for status/note/create

components/
  dashboard/charts.tsx      # recharts wrappers
  jobs/*                    # table/forms/status/note components
  ui/*                      # lightweight UI primitives

lib/
  fit-score.ts              # fit score and skill extraction logic
  jobs.ts                   # query/aggregation functions
  prisma.ts                 # Prisma singleton client
  validators.ts             # zod schemas

prisma/
  schema.prisma
  seed.ts
```

## Fit Score Logic (MVP)

RoleLens computes a rule-based fit score from job title/description:

- React fit
- TypeScript fit
- Next.js fit
- Frontend fit
- Experience fit (inferred by seniority)
- Work authorization risk fit
- Weighted overall fit

This is intentionally simple and transparent for MVP.

## Expansion Points

1. Parser adapters per source:
   - Greenhouse
   - Lever
   - Ashby
2. Better extraction:
   - tokenizer/NER
   - LLM-assisted structured extraction
3. Authentication and multi-user workspace
4. Browser extension for one-click save
5. Reminder system for stale applications
6. More analytics (conversion by status, interview ratio, timeline trend)

## Notes

- MVP intentionally avoids fragile LinkedIn/Indeed scraping.
- Focus is reliable capture + analysis + tracking you can use daily.
- OpenNext on Cloudflare Workers is used instead of `next-on-pages`, so Edge-only constraints are avoided.
