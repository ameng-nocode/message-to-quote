"use client";

import { useCallback, useEffect, useState } from "react";
import { authError, signOut, useAuth } from "@/lib/auth";
import { sb } from "@/lib/supabase";
import { btnGhost, btnPrimary, IconX, inputCls } from "./ui";

type Member = { user_id: string; email: string; role: "owner" | "member" };
type Invite = { email: string };

/** Who is on the team. The owner invites by email: that person then opens the app and creates an account with the same email. */
export default function TeamSection() {
  const auth = useAuth();
  const me = auth.status === "signed-in" ? auth.user : null;
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const isOwner = members.some((m) => m.user_id === me?.id && m.role === "owner");

  const load = useCallback(async () => {
    const { data, error } = await sb().from("members").select("user_id,email,role").order("created_at");
    if (error) return setErr(authError(error));
    setMembers((data || []) as Member[]);
    const inv = await sb().from("invites").select("email").order("created_at");
    setInvites((inv.data || []) as Invite[]);
  }, []);
  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return setErr("That does not look like an email address.");
    if (members.some((m) => m.email === mail)) return setErr("Already on the team.");
    const { error } = await sb().from("invites").insert({ email: mail, invited_by: me?.id });
    if (error) return setErr(/duplicate/i.test(error.message) ? "Already invited." : authError(error));
    setEmail("");
    void load();
  }

  async function removeMember(m: Member) {
    const { error } = await sb().from("members").delete().eq("user_id", m.user_id);
    if (error) return setErr(authError(error));
    void load();
  }
  async function cancelInvite(i: Invite) {
    const { error } = await sb().from("invites").delete().eq("email", i.email);
    if (error) return setErr(authError(error));
    void load();
  }

  const link = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-[var(--q-border)] rounded-[12px] border border-[var(--q-border)]">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate text-[var(--q-text)]">
              {m.email}
              {m.user_id === me?.id && <span className="text-[var(--q-text-3)]"> (you)</span>}
            </span>
            <span className="text-[12px] text-[var(--q-text-3)]">{m.role === "owner" ? "Owner" : "Member"}</span>
            {isOwner && m.role !== "owner" && (
              <button className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--q-text-3)] hover:bg-[var(--q-danger-bg)] hover:text-[var(--q-danger)]" aria-label={`Remove ${m.email}`} onClick={() => void removeMember(m)}>
                <IconX />
              </button>
            )}
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.email} className="flex items-center gap-3 px-3 py-2 text-[13px]">
            <span className="min-w-0 flex-1 truncate text-[var(--q-text-2)]">{i.email}</span>
            <span className="text-[12px] font-semibold text-[var(--q-accent)]">Invited</span>
            <button className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--q-text-3)] hover:bg-[var(--q-danger-bg)] hover:text-[var(--q-danger)]" aria-label={`Cancel invite for ${i.email}`} onClick={() => void cancelInvite(i)}>
              <IconX />
            </button>
          </li>
        ))}
      </ul>

      {isOwner && (
        <div className="flex flex-col gap-2">
          <form className="flex flex-wrap gap-2" onSubmit={invite}>
            <input className={`${inputCls} max-w-[300px]`} type="email" aria-label="Email to invite" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" className={btnPrimary} disabled={!email.trim()}>
              Invite
            </button>
          </form>
          <p className="text-[12px] text-[var(--q-text-3)]">
            Then send them the app link. They choose &ldquo;Invited? Create your account&rdquo; with the same email.{" "}
            <button
              type="button"
              className="font-semibold text-[var(--q-accent)] hover:underline"
              onClick={async () => {
                await navigator.clipboard?.writeText(link).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? "Copied" : "Copy app link"}
            </button>
          </p>
        </div>
      )}
      {err && <p className="text-[12.5px] text-[var(--q-danger)]">{err}</p>}
      <div>
        <button className={`${btnGhost} h-9`} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
