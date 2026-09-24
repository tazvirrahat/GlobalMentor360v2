"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Download, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const noSubscription = () => () => {};

/**
 * Download PDF, Copy link, and Share where the browser can share (phones).
 * The result of copying is announced; Share appears only when it works.
 */
export function CertificateActions({ url, pdfHref, title }: { url: string; pdfHref: string; title: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  // navigator.share exists only in some browsers; the server snapshot (false)
  // is what SSR renders, so the markup never disagrees on hydration.
  const canShare = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.share === "function",
    () => false,
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied("idle"), 2500);
  }

  async function share() {
    try {
      await navigator.share({ title, url });
    } catch {
      // The person closed the share sheet; nothing to report.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="lg">
        <a href={pdfHref}>
          <Download aria-hidden /> Download PDF
        </a>
      </Button>
      <Button type="button" variant="secondary" size="lg" onClick={copy}>
        {copied === "copied" ? <Check className="text-verified" aria-hidden /> : <Link2 aria-hidden />}
        Copy link
      </Button>
      {canShare ? (
        <Button type="button" variant="secondary" size="lg" onClick={share}>
          <Share2 aria-hidden /> Share
        </Button>
      ) : null}
      <span role="status" className="text-sm text-graphite">
        {copied === "copied" ? "Link copied" : copied === "failed" ? "Could not copy. Copy the address bar instead." : ""}
      </span>
    </div>
  );
}
