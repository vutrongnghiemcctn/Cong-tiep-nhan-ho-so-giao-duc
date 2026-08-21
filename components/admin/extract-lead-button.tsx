"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExtractLeadButton({
  conversationId,
  hasLead,
}: {
  conversationId: string;
  hasLead: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleExtract() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/conversations/${conversationId}/lead`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Trích xuất thất bại, thử lại sau nhé.");
        return;
      }
      router.refresh();
    } catch {
      setError("Không kết nối được tới server, thử lại sau nhé.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button size="sm" variant="outline" onClick={handleExtract} disabled={loading}>
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {hasLead ? "Trích xuất lại" : "Trích xuất thông tin lead"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
