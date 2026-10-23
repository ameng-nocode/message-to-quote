"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { newDraft, saveQuote } from "@/lib/store";

/** Creates a fresh draft with the next quote number, then opens the editor. */
export default function NewQuotationPage() {
  const router = useRouter();
  useEffect(() => {
    const q = saveQuote(newDraft());
    router.replace(`/quotations/${q.id}`);
  }, [router]);
  return null;
}
