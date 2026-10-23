import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[480px]">
      <h1 className="text-[20px] font-semibold text-[var(--q-text)]">Page not found</h1>
      <p className="mt-1 text-[12.5px] text-[var(--q-text-2)]">This page does not exist. Head back to quotations to keep working.</p>
      <Link href="/" className="mt-4 inline-flex h-8 items-center text-[13px] font-medium text-[var(--q-text)] underline" style={{ textUnderlineOffset: 3 }}>
        Back to quotations
      </Link>
    </div>
  );
}
