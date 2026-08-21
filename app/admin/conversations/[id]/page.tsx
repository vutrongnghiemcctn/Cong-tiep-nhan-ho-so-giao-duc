import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { ExtractLeadButton } from "@/components/admin/extract-lead-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookedConsultationBadge, LeadQualityBadge, type LeadQuality } from "@/components/status-badge";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { cn, formatDateTime } from "@/lib/utils";

const leadFields: { key: "full_name" | "email" | "phone" | "country" | "education_level" | "major" | "availability"; label: string }[] = [
  { key: "full_name", label: "Họ tên" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Số điện thoại" },
  { key: "country", label: "Nước du học" },
  { key: "education_level", label: "Bậc học" },
  { key: "major", label: "Ngành học" },
  { key: "availability", label: "Thời gian rảnh" },
];

// Xem app/admin/conversations/page.tsx — cùng lý do cần ép render động.
export const dynamic = "force-dynamic";

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

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("conversation_id", id)
    .maybeSingle();

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

      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Thông tin lead</h2>
            {lead && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Trích xuất lúc {formatDateTime(lead.extracted_at)}
              </p>
            )}
          </div>
          <ExtractLeadButton conversationId={id} hasLead={!!lead} />
        </div>

        {lead ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <LeadQualityBadge quality={lead.quality as LeadQuality} />
              <BookedConsultationBadge booked={lead.booked_consultation} />
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {leadFields.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm">{lead[key] ?? "—"}</dd>
                </div>
              ))}
              {lead.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Ghi chú</dt>
                  <dd className="mt-0.5 text-sm">{lead.notes}</dd>
                </div>
              )}
            </dl>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Chưa trích xuất thông tin lead cho hội thoại này.
          </p>
        )}
      </Card>

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
