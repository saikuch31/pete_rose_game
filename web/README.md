This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Athlete lookups use the Supabase `athletes` table with the same columns as
`data/athletes.csv`. Set these in `.env.local` (or your deployment environment):

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The publishable key needs read access to the table through its grants and RLS
policies. Runtime lookups load the catalog from Supabase; the CSV is retained
only as a test fixture. Random selection, suggestions, and typo matching keep
their existing behavior.

Then run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Import players directly into Supabase

The new importer uses Python 3.9+ with no extra packages. Set `SUPABASE_URL`
and `SUPABASE_SECRET_KEY` in `web/.env.local`, `web/.env`, or your shell.
A legacy `SUPABASE_SERVICE_ROLE_KEY` also works. Use literal values in these
files; shell variables take precedence. Keep the secret key server-only.

From `web/`, preview and then import:

```bash
python3 scripts/import_players_supabase.py --players data/players.csv --dry-run
python3 scripts/import_players_supabase.py --players data/players.csv
```

Input requires a `Name` column; `Alternative positions` is optional. The script
cleans names, skips names already in Supabase or repeated in the input, and
inserts new athletes in batches. It leaves existing athletes unchanged and does
not read or update `athletes.csv`. One-word names go to
`data/single_name_players.csv` for review. Dry runs make no database or file changes.
Use `--sport Basketball` (default: `Football`), `--single-names PATH`, or
`--batch-size 500` as needed.

Run only one importer at a time: import IDs are assigned after the current
maximum in Supabase. The table must generate its own `id` for new rows.
Batches commit separately; on failure, the script reports confirmed progress.
Rerunning checks the database again and skips names already imported.
