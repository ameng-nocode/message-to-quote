# Message to Quote: setup guide for AI agents

When someone asks you to set up, run or install this app, follow this guide. Assume the person is not technical.

## How to work with them

- Run every command yourself. Ask them only for the steps marked **HUMAN STEP** (the scripts print those words too).
- Never ask them to paste a key, token or password into the chat. Open the `.env` file for them and say which line to fill:
  Windows `notepad .env`, macOS `open -e .env`, Linux `xdg-open .env`. Wait until they say it is saved.
- Short, plain words. One step at a time. Say what you are doing and what comes next.
- Never commit `.env`. Never print the values inside it. Never turn off row level security.
- Do not make more than one Supabase project without asking: the free plan allows only 2 active projects.

## Steps

1. **Node.js.** Run `node --version`. It must be 20.12 or newer (22 or 24 is best).
   If it is missing or older: HUMAN STEP, install the LTS version from https://nodejs.org, then reopen the terminal.
2. **Packages.** `npm install`
   It prints deprecation warnings and a few "vulnerabilities" (inside Next.js's own build tools and the Excel library).
   They do not affect how this app runs; tell them it is normal. Do not run `npm audit fix --force`: it installs major versions the app was not built for.
3. **Basic setup.** `npm run setup` and follow what it prints (it exits normally even when a HUMAN STEP is waiting, so read the text).
   It makes `.env` and checks for an AI key. If it asks for one (HUMAN STEP): the free option is Gemini at
   https://aistudio.google.com/apikey. Open `.env` for them, they paste the key after `GEMINI_API_KEY=`, then run `npm run setup` again.
   While they get the key you may already start the app (step 6) so they can look around: only Add with AI needs the key.
   The app reads `.env` when it starts, so restart `npm run dev` after the key is saved.
4. **Ask which mode they want.** Use these words:
   - "Just try it on this computer": browser mode. No login, the data stays in this browser. Go to step 6.
   - "Set it up for my team, with login": Supabase mode (needs a free Supabase account). Go to step 5.
5. **Supabase mode.** Ask them: "Which email will you sign in with?" (their login email, not a secret, fine in the chat).
   Then `npm run setup:supabase -- --owner-email <that email>`. Only that email can create the owner account, so nobody
   else can claim the project. It is saved in `.env` as `OWNER_EMAIL`, so later runs need no flag.
   - If the computer is already signed in to Supabase (`npx supabase projects list` works), there is no token step.
   - HUMAN STEP, access token: they make a free account at https://supabase.com/dashboard, then a token at
     https://supabase.com/dashboard/account/tokens. Open `.env`, they paste it after `SUPABASE_ACCESS_TOKEN=`. Run the command again.
   - "Pick the Supabase organization": show them the names it lists, ask which one, run again with `-- --org-id <id>`.
   - "no room for another project": their free plan is full. They can pause or delete a project in the dashboard,
     or reuse an empty one with `npm run setup:supabase -- --project-ref <ref>` (no database password needed).
   - The script makes the project, the tables, the security rules, the picture storage and the login settings,
     writes the keys into `.env`, and empties the access token again. Tell them they can revoke the token afterwards.
   - Region: Singapore (`ap-southeast-1`) by default. Another one: `npm run setup:supabase -- --region eu-central-1`.
6. **Start it.** Run `npm run dev` in the background and open http://localhost:3000 for them.
   If port 3000 is taken: `npm run dev -- -p 3001` and open that port instead.
7. **First use.**
   - Supabase mode: the page asks them to create the owner account, with the owner email from step 5.
   - Settings: company name, logo, address, bank details, tax, number prefix.
   - Products: import their price list from Excel (one row per product: `code, name, variant, category, unit, price`,
     plus one column per price list) or click Load sample data to try it first.
   - Team (Supabase mode, Settings, Team): the owner adds a colleague's email. The colleague opens the app and chooses
     "Invited? Create your account" with that same email.
8. **Check anytime.** `npm run setup:check` prints the mode, the AI key, and whether the tables and the owner account exist.

## When something goes wrong

| What they see | What to do |
|---|---|
| Add with AI says "No AI key on the server" | The key is missing in `.env`, or the app was started before it was added. Fix `.env`, stop `npm run dev`, start it again. |
| "AI service said 401 / 403" | The AI key is wrong. A new one goes in `.env`, then restart. |
| "AI service said 429" | Out of free credit or too many calls. Wait, or add a second key (OpenAI or OpenRouter) as a backup. |
| Login page: "This email is not invited" | The owner adds the email in Settings, Team first. |
| "No access yet" after signing in | Same: the owner invites that email, then they sign in again. |
| Forgot password email never comes | Supabase's built-in email sends only a few per hour. Wait, or set up SMTP in the Supabase dashboard. |
| `npm install` fails with `esbuild.exe ENOENT` | Antivirus removed a program file (it happens in Temp or Downloads). Move the folder somewhere normal like `C:\message-to-quote`, run `npm install` again. The app itself does not need esbuild (only `npm test` does), so `npm install --ignore-scripts` also gets it running. |
| `npm install` fails on the `supabase` package | Its download was blocked. Browser mode still works: `npm install --ignore-scripts`, and do Supabase later. |
| Windows: "cannot find" a file, or a path error, on install or start | The folder sits too deep (Windows stops at 260 characters). Move it somewhere short like `C:\message-to-quote`, run `npm install` again. |
| "Not saved" in browser mode | The browser is full (about 5 MB, mostly photos). Use smaller photos, or move to Supabase mode. |

## Putting it online (only if they ask)

Online means Supabase mode. Before you deploy, check all of these:
1. `npm run setup:check` says `owner email lock: on`. If it says OFF, run `npm run setup:supabase -- --owner-email <email>` first.
2. The owner account is created (setup:check: `owner account: yes`).
3. Vercel: import the GitHub repo, add the keys from `.env` under Environment Variables: the AI key and the two
   `NEXT_PUBLIC_SUPABASE_` keys. Never add `SUPABASE_DB_PASSWORD` or the access token: the app does not need them.
4. In the Supabase dashboard, Authentication, URL Configuration: set Site URL to the live address, so password reset links point to it.

Browser mode (no login) online: Add with AI refuses to answer, because anyone with the link would spend their AI credit.
Only if they insist and understand that, `ALLOW_PUBLIC_AI=1` turns it on (then `ASSIST_LIMIT_PER_HOUR` per visitor still applies).

## Changing the code

- After any change to `src/lib` (prices, totals, numbering, import, the AI actions) or the quotation editor, run `npm test`. It must stay green.
- Supabase mode has its own checks (every field saved and loaded back). Run them against a local Supabase (`npx supabase start`), never a live project:
  `SUPABASE_TEST=1 NEXT_PUBLIC_SUPABASE_URL=<local API URL> NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key> npm test`
- Then `npm run build` before you call it done.

## Changing the tables later

The tables live in `supabase/migrations/`. Add a new migration file, then run `npm run setup:supabase` again: it pushes only the new files
(safe to rerun; it needs the access token or a signed-in CLI, and uses `SUPABASE_DB_PASSWORD` from `.env` when it is there).
Do not edit tables by hand in the dashboard, or the next push will not match.
