import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cn, formatDateTime } from "@/lib/utils";

export default async function AdminConversationDetailPage({
  params,
}: PageProps<"/admin/conversations/[id]">) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, channel, started_at")
    .eq("id", id)
    .maybeSingle();

  if (!conversation) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  return (
    <>
      <AdminPageHeader
        title="Chi tiết hội thoại"
        description={`Kênh ${conversation.channel} · bắt đầu lúc ${formatDateTime(conversation.started_at)}`}
        action={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link href="/admin/conversations">
                <ArrowLeft className="size-3.5" />
                Quay lại
              </Link>
            }
          />
        }
      />

      <Card className="p-4">
        <div className="space-y-3">
          {(messages ?? []).map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.sender === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                  m.sender === "user"
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted text-foreground",
                )}
              >
                <p>{m.content}</p>
                <p className="mt-1 text-[0.7rem] opacity-70">{formatDateTime(m.created_at)}</p>
              </div>
            </div>
          ))}
          {(!messages || messages.length === 0) && (
            <p className="text-sm text-muted-foreground">
              Chưa có tin nhắn nào trong hội thoại này.
            </p>
          )}
        </div>
      </Card>
    </>
  );
}
