"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { sb, SUPABASE_ON } from "./supabase";

export type AuthState =
  | { status: "loading" }
  | { status: "off" } // browser mode, nobody signs in
  | { status: "signed-out" }
  | { status: "signed-in"; user: User; recovery: boolean }; // recovery = came from a password reset link

// read before the client takes the tokens out of the address bar
const cameFromReset = typeof window !== "undefined" && /type=recovery/.test(window.location.hash);

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(SUPABASE_ON ? { status: "loading" } : { status: "off" });
  useEffect(() => {
    if (!SUPABASE_ON) return;
    let recovery = cameFromReset;
    const client = sb();
    void client.auth.getSession().then(({ data }) => {
      setState(data.session ? { status: "signed-in", user: data.session.user, recovery } : { status: "signed-out" });
    });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") recovery = true;
      setState(session ? { status: "signed-in", user: session.user, recovery } : { status: "signed-out" });
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return state;
}

/** Supabase answers in its own words; these are the ones people will see. */
export function authError(e: { message?: string } | null | undefined): string {
  const m = e?.message || "";
  if (/NOT_INVITED|Database error saving new user/i.test(m)) return "This email is not invited. Ask the owner to invite it in Settings, Team.";
  if (/Invalid login credentials/i.test(m)) return "Wrong email or password.";
  if (/already registered|already been registered/i.test(m)) return "This email already has an account. Sign in instead.";
  if (/Email not confirmed/i.test(m)) return "Confirm your email first: open the link Supabase sent you.";
  if (/Password should be at least|weak/i.test(m)) return "Use a longer password: 8 characters or more.";
  if (/rate limit|too many/i.test(m)) return "Too many tries. Wait a minute and try again.";
  if (/fetch|network/i.test(m)) return "Could not reach Supabase. Check the internet and the Supabase address in .env.";
  return m || "Something went wrong. Try again.";
}

/** Is there an owner yet? Decides whether the login page offers "Create the owner account". */
export async function hasOwner(): Promise<boolean> {
  const { data, error } = await sb().rpc("has_owner");
  if (error) throw error;
  return data === true;
}

/** Is the owner account locked to the email given at setup? Older databases without the lock say no. */
export async function ownerLocked(): Promise<boolean> {
  const { data, error } = await sb().rpc("owner_locked");
  return !error && data === true;
}

/** Signed in: become a member if this email was invited. True when the person is (now) a member. */
export async function joinIfInvited(): Promise<boolean> {
  const { data, error } = await sb().rpc("accept_invite");
  if (error) throw error;
  return data === true;
}

export async function signOut() {
  await sb().auth.signOut();
  window.location.href = "/login";
}
