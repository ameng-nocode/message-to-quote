"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authError, hasOwner, ownerLocked, useAuth } from "@/lib/auth";
import { sb, SUPABASE_ON } from "@/lib/supabase";
import { btnGhost, btnPrimary, Field, inputCls } from "@/components/ui";
import { Wordmark } from "@/components/Logo";

type Mode = "signin" | "signup" | "forgot" | "newpass";

/** Sign in, create the owner account (first time), create an invited account, reset a password. Supabase mode only. */
export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [owner, setOwner] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!SUPABASE_ON) {
      router.replace("/");
      return;
    }
    hasOwner()
      .then((v) => {
        setOwner(v);
        if (!v) {
          setMode("signup");
          void ownerLocked().then(setLocked);
        }
      })
      .catch((e) => setErr(authError(e)));
  }, [router]);

  useEffect(() => {
    if (auth.status !== "signed-in") return;
    if (auth.recovery) setMode("newpass");
    else router.replace("/");
  }, [auth, router]);

  if (!SUPABASE_ON) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setNote("");
    setBusy(true);
    try {
      const client = sb();
      if (mode === "signin") {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await client.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) setNote("Account made. Open the confirmation link Supabase emailed you, then sign in.");
      } else if (mode === "forgot") {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/login` });
        if (error) throw error;
        setNote("If this email has an account, a reset link is on its way. Open it on this device.");
      } else if (mode === "newpass") {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        window.location.href = "/";
      }
    } catch (x) {
      // no owner yet: a refused sign-up means this is not the owner email given at setup
      const refused = mode === "signup" && owner === false && /NOT_OWNER_EMAIL|NOT_INVITED|Database error saving new user/i.test((x as { message?: string })?.message || "");
      setErr(refused ? "Only the owner email given at setup can create the owner account." : authError(x as { message?: string }));
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = {
    signin: "Sign in",
    signup: owner === false ? "Create the owner account" : "Create your account",
    forgot: "Reset your password",
    newpass: "Set a new password",
  };
  const hints: Partial<Record<Mode, string>> = {
    signup:
      owner === false
        ? `${locked ? "Use the owner email given at setup." : "The first account is the owner."} The owner invites the rest of the team in Settings, Team.`
        : "Only emails the owner invited can make an account.",
    forgot: "We email you a link to set a new password.",
  };
  const action: Record<Mode, string> = { signin: "Sign in", signup: "Create account", forgot: "Send reset link", newpass: "Save password" };

  return (
    <div className="flex min-h-dvh items-start justify-center px-4 pt-[12vh]">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex justify-center">
          <Wordmark size={34} />
        </div>
        <form onSubmit={submit} className="q-glass rounded-[22px] bg-white/75 p-6 sm:p-7">
          <h1 className="text-[20px] font-bold tracking-[-0.3px] text-[var(--q-text)]">{titles[mode]}</h1>
          {hints[mode] && <p className="mt-1 text-[13px] text-[var(--q-text-3)]">{hints[mode]}</p>}
          <div className="mt-4 flex flex-col gap-3">
            {mode !== "newpass" && (
              <Field label="Email">
                <input className={`${inputCls} h-11`} type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            )}
            {mode !== "forgot" && (
              <Field label={mode === "newpass" ? "New password" : "Password"} hint={mode === "signin" ? undefined : "8 characters or more"}>
                <input
                  className={`${inputCls} h-11`}
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "signin" ? undefined : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            )}
          </div>
          {err && <p className="mt-3 text-[13px] text-[var(--q-danger)]">{err}</p>}
          {note && <p className="mt-3 text-[13px] text-[var(--q-ok)]">{note}</p>}
          <button type="submit" className={`${btnPrimary} mt-5 h-11 w-full`} disabled={busy || owner === null}>
            {busy ? "Please wait" : action[mode]}
          </button>
          <div className="mt-4 flex flex-wrap justify-between gap-2 text-[13px]">
            {mode === "signin" && (
              <>
                <button type="button" className="font-semibold text-[var(--q-accent)] hover:underline" onClick={() => setMode("forgot")}>
                  Forgot password
                </button>
                <button type="button" className="font-semibold text-[var(--q-accent)] hover:underline" onClick={() => setMode("signup")}>
                  Invited? Create your account
                </button>
              </>
            )}
            {(mode === "signup" || mode === "forgot") && owner !== false && (
              <button type="button" className="font-semibold text-[var(--q-accent)] hover:underline" onClick={() => setMode("signin")}>
                Back to sign in
              </button>
            )}
          </div>
        </form>
        {mode === "newpass" && (
          <button type="button" className={`${btnGhost} mx-auto mt-3 flex`} onClick={() => (window.location.href = "/")}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
