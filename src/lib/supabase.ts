"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Two ways to run the app:
   - no Supabase keys in .env: browser mode. No login, everything is kept in this browser (good for a demo or a try-out).
   - NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY set: Supabase mode. Login, and the data is shared by the team. */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const SUPABASE_ON = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!SUPABASE_ON) throw new Error("Supabase is not set up");
  // implicit flow: the password reset link signs the person in straight from the email, no server route needed
  client ??= createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" } });
  return client;
}

/** The signed-in person's token, for our own server routes. Empty in browser mode or when signed out. */
export async function accessToken(): Promise<string> {
  if (!SUPABASE_ON) return "";
  const { data } = await sb().auth.getSession();
  return data.session?.access_token ?? "";
}
