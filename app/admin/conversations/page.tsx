import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { formatDateTime } from "@/lib/utils";

export default async function AdminConversationsPage() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, channel, started_at, messages(count)")
    .order("started_at", { ascending: false });

  const conversations = data ?? [];

  return (
    <>
      <AdminPageHeader
        title="Hội thoại"
        description="Lịch sử hội thoại của khách với chatbot hỏi đáp trên trang chủ."
      />

      <Card>
        {error ? (
          <p className="p-6 text-sm text-destructive">
            Không tải được danh sách hội thoại, thử tải lại trang.
          </p>
        ) : conversations.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Chưa có hội thoại nào từ khách.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kênh</TableHead>
                <TableHead>Số tin nhắn</TableHead>
                <TableHead>Thời gian bắt đầu</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map((conv) => (
                <TableRow key={conv.id}>
                  <TableCell className="font-medium">{conv.channel}</TableCell>
                  <TableCell>{conv.messages[0]?.count ?? 0} tin nhắn</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(conv.started_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={`/admin/conversations/${conv.id}`}>Xem</Link>}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
