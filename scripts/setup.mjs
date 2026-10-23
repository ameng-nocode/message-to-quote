#!/usr/bin/env node
// Setup helper. Safe to run again: steps already done are skipped. Never prints a secret.
//
//   npm run setup                  browser mode: checks Node, makes .env, says what is missing
//   npm run setup:supabase -- --owner-email you@example.com
//                                  Supabase mode: makes the project, the tables, the login settings, writes the keys to .env,
//                                  and locks the owner account to that email
//   npm run setup:check            prints where the setup stands (for you or your AI agent)
//
// Lines starting with "HUMAN STEP" are things only a person can do. Everything else this script does itself.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = resolve(ROOT, ".env");
const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "local";
const flag = (name, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ok = (m) => console.log(`  ok    ${m}`);
const info = (m) => console.log(`        ${m}`);
const human = (m) => console.log(`\nHUMAN STEP: ${m}\n`);
const fail = (m) => {
  console.log(`\nSTOPPED: ${m}\n`);
  process.exit(1);
};

/* ---------- .env: read and update without losing comments ---------- */

function readEnv() {
  if (!existsSync(ENV)) return {};
  const out = {};
  for (const line of readFileSync(ENV, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function writeEnv(values) {
  let text = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const re = new RegExp(`^\\s*#?\\s*${key}\\s*=.*$`, "m");
    if (value === null) text = text.replace(new RegExp(`^\\s*${key}\\s*=.*\\r?\\n?`, "m"), "");
    else if (re.test(text)) text = text.replace(re, `${key}=${value}`);
    else text += (text.endsWith("\n") || !text ? "" : "\n") + `${key}=${value}\n`;
  }
  writeFileSync(ENV, text);
}

function ensureEnvFile() {
  if (existsSync(ENV)) return ok(".env is there");
  copyFileSync(resolve(ROOT, ".env.example"), ENV);
  ok("made .env from .env.example");
}

/* ---------- checks ---------- */

function checkNode() {
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 20 || (maj === 20 && min < 12)) fail(`Node.js ${process.versions.node} is too old. Install Node.js 22 or newer from https://nodejs.org, then run this again.`);
  ok(`Node.js ${process.versions.node}`);
}

function checkInstall() {
  if (!existsSync(resolve(ROOT, "node_modules", "next"))) fail("Packages are not installed. Run: npm install");
  ok("packages installed");
  // Windows tools give up on paths over 260 characters; the deepest package files are about 150 characters below this folder
  if (process.platform === "win32" && ROOT.length > 110)
    info(`note: this folder's path is long (${ROOT.length} characters). If something says a file cannot be found, move the folder somewhere short, like C:\\message-to-quote`);
}

function aiKeys(env) {
  return ["OPENAI_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY"].filter((k) => (env[k] || "").trim());
}

function checkAi(env) {
  const keys = aiKeys(env);
  if (keys.length) return ok(`AI key: ${keys.join(", ")}`), true;
  human(
    [
      "Add one AI key to .env (the app needs it to read orders). Easiest and free: Gemini.",
      "  1. Open https://aistudio.google.com/apikey and sign in with Google.",
      '  2. Click "Create API key" and copy it.',
      "  3. Open the file .env in this folder and paste it after GEMINI_API_KEY=",
      "Do not paste the key into a chat. Then run this again.",
    ].join("\n"),
  );
  return false;
}

/* ---------- Supabase CLI ---------- */

// the CLI's own Node entry, called straight through Node: no shell, so long folder paths on Windows do not break it
const SUPABASE_CLI = resolve(ROOT, "node_modules", "supabase", "dist", "supabase.js");

function cli(cliArgs, { quiet = true } = {}) {
  if (!existsSync(SUPABASE_CLI)) fail("The Supabase CLI is not installed. Run: npm install   (if its download is blocked on your network, browser mode still works)");
  // empty lines in .env must not hide a token the CLI already has
  const env = { ...process.env, ...Object.fromEntries(Object.entries(readEnv()).filter(([, v]) => v)) };
  const r = spawnSync(process.execPath, [SUPABASE_CLI, ...cliArgs], { cwd: ROOT, env, encoding: "utf8", stdio: quiet ? "pipe" : "inherit" });
  // stdout alone for reading JSON: the CLI adds notes like "Cannot find project ref" on stderr
  return { code: r.status ?? 1, out: (r.stdout || "") + (r.stderr || ""), stdout: r.stdout || "" };
}

function json(out) {
  const start = out.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(out.slice(start));
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function setupSupabase() {
  checkNode();
  checkInstall();
  ensureEnvFile();
  let env = readEnv();

  // 0. who the owner is: only this email can create the owner account, so nobody else can claim the project first
  const ownerEmail = flag("owner-email", env.OWNER_EMAIL || "").trim().toLowerCase();
  if (!EMAIL.test(ownerEmail))
    fail("Which email will the owner sign in with? (Ask the person: it is their login email, not a secret.)\nThen run: npm run setup:supabase -- --owner-email their@email.com");
  writeEnv({ OWNER_EMAIL: ownerEmail });
  ok(`owner email: ${ownerEmail}`);

  // 1. a way into the person's Supabase account
  let list = cli(["projects", "list", "-o", "json"]);
  if (list.code !== 0) {
    if (/access token|log in|login/i.test(list.out)) {
      human(
        [
          "Give this setup access to your Supabase account (one time).",
          "  1. Make a free account at https://supabase.com/dashboard (skip if you have one).",
          "  2. Open https://supabase.com/dashboard/account/tokens and click Generate new token. Name it message-to-quote.",
          "  3. Open the file .env in this folder and paste it after SUPABASE_ACCESS_TOKEN=",
          "The setup empties that line again when it is done. Then run: npm run setup:supabase",
        ].join("\n"),
      );
      process.exit(1);
    }
    fail(`The Supabase CLI did not answer:\n${list.out.slice(0, 600)}`);
  }
  ok("signed in to Supabase");

  // 2. the project: the one in .env, the one given with --project-ref, or a new one
  let ref = flag("project-ref", env.SUPABASE_PROJECT_REF || "");
  let password = env.SUPABASE_DB_PASSWORD || "";
  if (!ref) {
    const orgs = json(cli(["orgs", "list", "-o", "json"]).stdout) || [];
    let org = flag("org-id");
    if (!org && orgs.length === 1) org = orgs[0].id;
    if (!org) {
      const names = orgs.map((o) => `  ${o.id}  ${o.name}`).join("\n") || "  (none found)";
      fail(`Pick the Supabase organization to put the project in, then run again with --org-id:\n${names}\nExample: npm run setup:supabase -- --org-id ${orgs[0]?.id || "<id>"}`);
    }
    password = randomBytes(18).toString("base64url");
    writeEnv({ SUPABASE_DB_PASSWORD: password }); // saved first, so nothing is lost if a later step stops
    const region = flag("region", "ap-southeast-1");
    const name = flag("name", "message-to-quote");
    info(`making Supabase project "${name}" in ${region} (takes 1 to 3 minutes)`);
    const made = cli(["projects", "create", name, "--org-id", org, "--db-password", password, "--region", region, "-o", "json"]);
    if (made.code !== 0) {
      if (/limit|maximum|free.*project/i.test(made.out))
        fail("Your Supabase plan has no room for another project (the free plan allows 2 active ones). Pause or delete one at https://supabase.com/dashboard, or reuse an empty project: npm run setup:supabase -- --project-ref <ref>");
      fail(`Could not make the project:\n${made.out.slice(0, 600)}`);
    }
    const p = json(made.stdout) || {};
    ref = p.ref || p.id || "";
    // older CLI versions print no JSON here: find the new project by its name instead
    if (!ref) ref = (json(cli(["projects", "list", "-o", "json"]).stdout) || []).filter((x) => x.name === name && x.organization_id === org).map((x) => x.ref || x.id).pop() || "";
    if (!ref) fail("Supabase made the project but did not say its ref. Find it at https://supabase.com/dashboard and run: npm run setup:supabase -- --project-ref <ref>");
    writeEnv({ SUPABASE_PROJECT_REF: ref });
    ok(`project made: ${ref}`);
  } else {
    writeEnv({ SUPABASE_PROJECT_REF: ref });
    ok(`project: ${ref}`);
  }
  // the database password is optional: when it is unknown, the CLI signs in to the database with the access token
  const pw = password ? ["-p", password] : [];

  // 3. wait until the new project is up
  for (let i = 0; ; i++) {
    const p = (json(cli(["projects", "list", "-o", "json"]).stdout) || []).find((x) => x.ref === ref || x.id === ref);
    const status = p?.status || "";
    if (/ACTIVE_HEALTHY/.test(status)) break;
    if (i >= 36) fail(`The project is still starting (${status || "unknown"}). Wait a few minutes and run: npm run setup:supabase`);
    if (i === 0) info(`waiting for the project to start (${status || "starting"})`);
    await sleep(10000);
  }
  ok("project is running");

  // 4. tables, security rules and the pictures bucket; then the login settings
  const link = cli(["link", "--project-ref", ref, ...pw]);
  if (link.code !== 0) fail(`Could not connect to the database:\n${link.out.slice(0, 600)}\nIf the password is wrong, reset it in the dashboard, put it in .env as SUPABASE_DB_PASSWORD, and run again.`);
  ok("linked");
  const push = cli(["db", "push", "--linked", ...pw, "--yes"]);
  if (push.code !== 0)
    fail(
      `Could not make the tables:\n${push.out.slice(0, 800)}` +
        (password ? "" : `\nIf it asks for a password: open .env, paste the database password after SUPABASE_DB_PASSWORD= (reset it at https://supabase.com/dashboard/project/${ref}/database/settings), and run again.`),
    );
  ok("tables, security rules and picture storage are in place");
  const conf = cli(["config", "push", "--project-ref", ref, "--yes"]);
  if (conf.code !== 0) info(`login settings were not pushed (${conf.out.trim().split("\n").pop()}). In the dashboard, Authentication, Sign In / Providers, Email: turn off "Confirm email".`);
  else ok("login settings: email + password, no confirmation email");

  // 5. the public keys the app needs
  const keys = json(cli(["projects", "api-keys", "--project-ref", ref, "-o", "json", "--reveal"]).stdout) || [];
  const anon = keys.find((k) => k.name === "anon")?.api_key || keys.find((k) => /publishable/i.test(k.type || k.name || ""))?.api_key;
  if (!anon) fail(`Could not read the project's public key. Copy the "anon public" key from https://supabase.com/dashboard/project/${ref}/settings/api-keys into .env as NEXT_PUBLIC_SUPABASE_ANON_KEY.`);
  const url = `https://${ref}.supabase.co`;

  // 6. lock the owner account to the owner's email (the service key is used once here and never saved)
  const service = keys.find((k) => k.name === "service_role")?.api_key || keys.find((k) => /secret/i.test(k.type || k.name || ""))?.api_key;
  if (!service) fail(`Could not read the project's service key to lock the owner email. Run again in a minute: npm run setup:supabase`);
  const headers = { apikey: service, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
  if (service.startsWith("eyJ")) headers.Authorization = `Bearer ${service}`;
  let locked = false;
  for (let i = 0; i < 6 && !locked; i++) {
    const r = await fetch(`${url}/rest/v1/owner_email?on_conflict=id`, { method: "POST", headers, body: JSON.stringify({ id: 1, email: ownerEmail }) }).catch(() => null);
    locked = Boolean(r?.ok);
    if (!locked) await sleep(5000); // the new table can take a moment to show up in the API
  }
  if (!locked) fail("Could not lock the owner email (the database API did not answer). Run again: npm run setup:supabase");
  ok(`owner account locked to ${ownerEmail}`);

  writeEnv({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_ACCESS_TOKEN: "" });
  ok("keys written to .env (the access token is emptied again)");

  env = readEnv();
  const ai = checkAi(env);
  console.log(`\nSupabase is ready.${ai ? "" : " Add the AI key above first."}`);
  info(`Next: npm run dev, open http://localhost:3000 and create the owner account with ${ownerEmail}.`);
  info(`You can revoke the access token now at https://supabase.com/dashboard/account/tokens`);
}

function setupLocal() {
  checkNode();
  checkInstall();
  ensureEnvFile();
  const env = readEnv();
  const ai = checkAi(env);
  const sb = env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  ok(sb ? "mode: Supabase (login + shared data)" : "mode: browser (no login, data stays in this browser)");
  if (ai) {
    console.log("\nReady. Run: npm run dev   then open http://localhost:3000");
    if (!sb) info("For login and a team, run: npm run setup:supabase");
  }
}

async function check() {
  const env = readEnv();
  console.log(`Node.js ${process.versions.node}`);
  console.log(`packages installed: ${existsSync(resolve(ROOT, "node_modules", "next")) ? "yes" : "no (run npm install)"}`);
  console.log(`.env: ${existsSync(ENV) ? "yes" : "no (run npm run setup)"}`);
  console.log(`AI key: ${aiKeys(env).join(", ") || "none"}`);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return console.log("mode: browser (no Supabase keys)");
  console.log(`mode: Supabase (${url})`);
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/has_owner`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: "{}" });
    if (r.status === 404) return console.log("tables: missing (run npm run setup:supabase)");
    console.log(`tables: ${r.ok ? "yes" : `error ${r.status}`}`);
    if (r.ok) console.log(`owner account: ${(await r.json()) === true ? "yes" : "not yet (open the app and create it)"}`);
    const l = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/owner_locked`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: "{}" });
    if (l.ok) console.log(`owner email lock: ${(await l.json()) === true ? "on (only the setup email can create the owner account)" : "OFF: run npm run setup:supabase -- --owner-email <email> before putting the app online"}`);
    else if (l.status === 404) console.log("owner email lock: missing (run npm run setup:supabase again to add the newest tables)");
  } catch (e) {
    console.log(`Supabase not reachable: ${String(e).slice(0, 120)}`);
  }
}

if (command === "supabase") await setupSupabase();
else if (command === "check") await check();
else setupLocal();
