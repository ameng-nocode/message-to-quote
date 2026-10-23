"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { joinIfInvited, signOut, useAuth } from "@/lib/auth";
import { loadAll, useDataPhase } from "@/lib/data";
import { useSettings } from "@/lib/settings";
import { IconBox, IconDoc, IconGear, IconPerson, useScrollLock } from "./ui";
import { Wordmark } from "./Logo";
import NewQuoteButton, { Spinner } from "./NewQuoteButton";

const LINKS = [
  { href: "/", label: "Quotations", icon: IconDoc, match: (p: string) => p === "/" || p.startsWith("/quotations/") },
  { href: "/customers", label: "Customers", icon: IconPerson, match: (p: string) => p.startsWith("/customers") },
  { href: "/products", label: "Products", icon: IconBox, match: (p: string) => p.startsWith("/products") },
  { href: "/settings", label: "Settings", icon: IconGear, match: (p: string) => p.startsWith("/settings") },
];

const initials = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";

/** The nav links and the company at the foot: the desktop side nav and the phone drawer are the same list. */
function NavBody({ pathname, company, onPick }: { pathname: string; company: string; onPick?: () => void }) {
  return (
    <>
      <Link href="/" onClick={onPick} className="px-1">
        <Wordmark size={34} />
      </Link>
      <div className="flex flex-col gap-1">
        {LINKS.map((l) => {
          const on = l.match(pathname);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={onPick}
              aria-current={on ? "page" : undefined}
              className={`flex h-10 items-center gap-[11px] rounded-[12px] px-3 text-[14px] font-semibold ${
                on ? "q-pri text-white" : "text-[var(--q-nav-text)] hover:bg-white/70 hover:text-[var(--q-text)]"
              }`}
            >
              <Icon size={18} />
              {l.label}
            </Link>
          );
        })}
      </div>
      <div className="flex-1" />
      <Link
        href="/settings"
        onClick={onPick}
        className="flex items-center gap-2.5 rounded-[14px] border border-white/90 bg-white/75 p-2.5 hover:bg-white"
      >
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[12px] font-bold text-white q-pri shadow-none">{initials(company)}</span>
        <span className="min-w-0 flex-1 text-[13px] font-bold leading-tight text-[var(--q-text)] break-words">{company || "Your company"}</span>
      </Link>
    </>
  );
}

/** Desktop: a glass side nav, full height on the left. */
function SideNav({ pathname, company }: { pathname: string; company: string }) {
  return (
    <nav aria-label="Main" className="q-glass sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col gap-6 rounded-none border-y-0 border-l-0 px-3.5 py-5 shadow-none lg:flex">
      <NavBody pathname={pathname} company={company} />
    </nav>
  );
}

/** Phone and tablet: the same links in a glass drawer. */
function Drawer({ pathname, company, onClose }: { pathname: string; company: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button type="button" className="absolute inset-0 bg-[#0D1B3E]/35" aria-label="Close menu" onClick={onClose} />
      <nav aria-label="Main" className="q-glass q-sheet relative flex h-full w-[min(270px,86vw)] flex-col gap-6 rounded-none border-y-0 border-l-0 bg-white/85 px-3.5 py-5">
        <NavBody pathname={pathname} company={company} onPick={onClose} />
      </nav>
    </div>
  );
}

/** The quotation editor draws its own phone header (back, number, Send). */
const ownPhoneHeader = (p: string) => /^\/quotations\/[^/]+$/.test(p) && p !== "/quotations/new";

/** Supabase mode: signed in and a member of the company, or off to the login page. Browser mode: always in. */
function useAccess(): "wait" | "in" | "no-access" {
  const auth = useAuth();
  const router = useRouter();
  const [member, setMember] = useState<boolean | null>(null);
  const userId = auth.status === "signed-in" ? auth.user.id : "";
  useEffect(() => {
    if (auth.status === "signed-out") router.replace("/login");
  }, [auth.status, router]);
  useEffect(() => {
    if (!userId) return;
    joinIfInvited()
      .then(setMember)
      .catch(() => setMember(false));
  }, [userId]);
  if (auth.status === "off") return "in";
  if (auth.status !== "signed-in" || member === null) return "wait";
  return member ? "in" : "no-access";
}

function NoAccess() {
  const auth = useAuth();
  return (
    <div className="mx-auto max-w-[480px] text-[13.5px] text-[var(--q-text-2)]">
      <h1 className="text-[18px] font-semibold text-[var(--q-text)]">No access yet</h1>
      <p className="mt-1">
        {auth.status === "signed-in" ? auth.user.email : "This account"} is not on the team. Ask the owner to invite this email in Settings, Team, then sign in again.
      </p>
      <button className="mt-3 underline" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

/** Settings and every list are loaded once before any page shows, so pages can read them straight away. */
function DataGate({ children }: { children: React.ReactNode }) {
  const access = useAccess();
  const { phase, error } = useDataPhase();
  useEffect(() => {
    if (access === "in") void loadAll();
  }, [access]);
  if (access === "no-access") return <NoAccess />;
  if (phase === "ready") return <>{children}</>;
  if (phase === "error") {
    return (
      <div className="mx-auto max-w-[480px] text-[13px] text-[var(--q-text-2)]">
        <h1 className="text-[18px] font-semibold text-[var(--q-text)]">Could not load your data</h1>
        <p className="mt-1 break-words">{error}</p>
        <button className="mt-3 underline" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-[var(--q-text-3)]" aria-busy="true">
      <Spinner size={18} />
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const company = settings.company.name.trim();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useScrollLock(open);

  if (pathname === "/login") return <>{children}</>;
  if (pathname.endsWith("/print")) return <DataGate>{children}</DataGate>;

  return (
    <div className="flex h-dvh overflow-x-clip lg:h-auto lg:min-h-screen">
      <SideNav pathname={pathname} company={company} />
      {open && <Drawer pathname={pathname} company={company} onClose={() => setOpen(false)} />}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!ownPhoneHeader(pathname) && (
          <header className="q-glass z-30 flex h-[60px] shrink-0 items-center gap-2 rounded-none border-x-0 border-t-0 px-3 shadow-none lg:hidden">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--q-text)] hover:bg-white/70"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <Link href="/">
              <Wordmark size={30} />
            </Link>
            <span className="flex-1" />
            <NewQuoteButton iconSize={13} className="q-pri flex h-10 items-center gap-1.5 rounded-[10px] px-3.5 text-[14px] font-semibold text-white disabled:opacity-80">
              New
            </NewQuoteButton>
          </header>
        )}
        <main id="q-main" className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4 lg:overflow-visible lg:px-6 lg:py-6">
          <DataGate>{children}</DataGate>
        </main>
      </div>
    </div>
  );
}
