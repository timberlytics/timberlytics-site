# Timberlytics

A Supabase-backed woodworking business planner for turning YouTube builds and loose plans into priced materials, labor estimates, secure user-owned build data, cut lists, and Word-compatible exports.

## Stack

- Vite front end
- Supabase Auth for email/password accounts
- Supabase MFA for authenticator-app 2FA
- Supabase Postgres for projects, materials, and cuts
- Supabase Row Level Security so users can only access their own build data

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env example:

   ```bash
   copy .env.example .env
   ```

3. Add your Supabase project values to `.env`:

   ```bash
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```

4. In Supabase, open **SQL Editor** and run:

   ```text
   supabase/schema.sql
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

## Supabase Settings

In **Authentication > Providers**, enable Email. In **Authentication > Multi-Factor**, enable TOTP/app authenticator MFA if it is not already enabled.

For production, add your deployed domain to Supabase Auth redirect URLs:

```text
https://timberlytics.com
https://www.timberlytics.com
```

## Security Notes

- Only `VITE_SUPABASE_ANON_KEY` belongs in the browser.
- Never put a Supabase service-role key in `.env` for this front end.
- The SQL in `supabase/schema.sql` enables RLS and scopes every project, material, and cut row to `auth.uid()`.
- MFA is user-enrolled from the account panel after sign-in.

## Deployment

Cloudflare Pages is a good fit:

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Railway also works as a static build if you prefer keeping it there, but Cloudflare Pages pairs nicely with a Cloudflare-managed `timberlytics.com`.
