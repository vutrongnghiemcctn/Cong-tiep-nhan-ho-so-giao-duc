import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const CONVERSATION_COOKIE = "dh24_conv";

const QNA = [
  {
    q: "Dịch vụ này gồm những gì?",
    a: "Có 2 gói: gói Cơ bản chỉ hỗ trợ chuẩn bị và nộp hồ sơ, gói Toàn diện thêm cả tư vấn xin học bổng và phỏng vấn.",
  },
  {
    q: "Mất bao lâu để có kết quả?",
    a: "Sau khi nộp đủ hồ sơ, hệ thống đối chiếu và báo kết quả sơ bộ trong vài phút. Kết quả chính thức từ trường thường mất 2-6 tuần tùy trường.",
  },
  {
    q: "Cần chuẩn bị giấy tờ gì?",
    a: "3 loại: bảng điểm học tập (định dạng PDF), ảnh chứng chỉ IELTS, và ảnh CMND/CCCD hoặc hộ chiếu.",
  },
  {
    q: "Chi phí dịch vụ là bao nhiêu?",
    a: "Tùy gói và bậc học, xem báo giá ngay trên trang chủ sau khi điền form, không mất phí xem báo giá.",
  },
  {
    q: "Tôi chưa có bằng IELTS thì có đăng ký được không?",
    a: "Vẫn đăng ký được, nhưng cần bổ sung chứng chỉ IELTS trước khi nộp hồ sơ chính thức cho trường.",
  },
  {
    q: "Làm sao biết mình đủ điều kiện vào trường nào?",
    a: "Sau khi nộp đủ hồ sơ trong cổng hồ sơ, hệ thống tự so sánh điểm học tập và điểm IELTS với điểm chuẩn từng trường, báo ngay trường nào đủ điều kiện.",
  },
  {
    q: "Sau khi điền form báo giá, bước tiếp theo là gì?",
    a: "Đội ngũ tư vấn sẽ xem xét và duyệt yêu cầu, sau đó gửi email mời bạn vào cổng hồ sơ để nộp giấy tờ.",
  },
  {
    q: "Hồ sơ của tôi có được bảo mật không?",
    a: "Có, hồ sơ chỉ hiển thị cho bạn và đội ngũ tư vấn sau khi đăng nhập, không công khai.",
  },
  {
    q: "Tôi cần liên hệ ai nếu có thắc mắc khác?",
    a: "Bạn có thể để lại câu hỏi ngay trong khung chat này, hoặc để lại email/số điện thoại trong form báo giá, đội ngũ sẽ liên hệ lại.",
  },
];

const SYSTEM_INSTRUCTION = `Bạn là trợ lý tư vấn của DuHoc24, một dịch vụ hỗ trợ hồ sơ du học.

Về THÔNG TIN DỊCH VỤ: bạn CHỈ được nói những gì có trong đúng bộ câu hỏi và câu trả lời dưới đây. Không tự thêm thông tin dịch vụ nào ngoài phạm vi này, kể cả khi có vẻ hữu ích hay bạn nghĩ mình biết câu trả lời.

${QNA.map(({ q, a }) => `Hỏi: ${q}\nĐáp: ${a}`).join("\n\n")}

Về TRÍ NHỚ HỘI THOẠI: bạn được cung cấp toàn bộ lịch sử chat của phiên hiện tại (các lượt trước đó trong contents) — luôn đọc và dùng lịch sử đó để trả lời mạch lạc. Nếu người dùng hỏi lại, hỏi tiếp một chủ đề đã nhắc, hỏi bạn vừa nói gì, hoặc dùng đại từ ("cái đó", "gói đó", "vậy còn...") tham chiếu tới lượt chat trước, hãy trả lời dựa trên đúng những gì đã trao đổi trong hội thoại — đây KHÔNG phải là thêm thông tin ngoài phạm vi, chỉ là nhắc lại/diễn giải lại nội dung đã có trong cuộc trò chuyện hoặc trong bộ câu hỏi trên.

Quy tắc trả lời:
- Trả lời bằng tiếng Việt, giọng thân thiện, ngắn gọn, tự nhiên như đang nhắn tin — có thể diễn đạt lại câu chữ nhưng không được đổi ý hay thêm thông tin dịch vụ ngoài bộ câu hỏi trên.
- Nếu câu hỏi của người dùng khớp với một hoặc nhiều mục trong bộ câu hỏi trên (trực tiếp hoặc là câu hỏi tiếp nối một mục đã trả lời trước đó trong hội thoại), trả lời dựa trên đúng (các) mục đó và ngữ cảnh hội thoại.
- Chỉ khi câu hỏi hoàn toàn nằm ngoài cả bộ câu hỏi trên lẫn nội dung đã trao đổi trong hội thoại (ví dụ hỏi về chủ đề không liên quan gì tới DuHoc24/hồ sơ du học), mới lịch sự nói rằng bạn chưa có thông tin về việc đó, và hướng người dùng để lại câu hỏi trong khung chat hoặc để lại email/số điện thoại trong form báo giá để đội tư vấn liên hệ lại — không được bịa thông tin dịch vụ.`;

interface DbMessage {
  sender: "user" | "bot";
  content: string;
}

function buildContents(history: DbMessage[]) {
  return history.map((m) => ({
    role: m.sender === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
}

// Trả về lịch sử hội thoại của khách (đọc từ Supabase qua cookie định danh
// phiên). Widget dùng kết quả này để hiển thị — không còn giữ state ở client.
export async function GET() {
  const cookieStore = await cookies();
  const conversationId = cookieStore.get(CONVERSATION_COOKIE)?.value;
  if (!conversationId) {
    return NextResponse.json({ messages: [] });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messages")
    .select("sender, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase select messages failed:", error);
    return NextResponse.json({ messages: [] });
  }

  return NextResponse.json({
    messages: (data ?? []).map((m) => ({ from: m.sender, text: m.content })),
  });
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Chưa cấu hình GEMINI_API_KEY trên server." },
      { status: 500 },
    );
  }

  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Thiếu nội dung câu hỏi." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const cookieStore = await cookies();
  let conversationId = cookieStore.get(CONVERSATION_COOKIE)?.value;

  if (!conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .insert({})
      .select("id")
      .single();
    if (error || !data) {
      console.error("Supabase create conversation failed:", error);
      return NextResponse.json(
        { error: "Không tạo được phiên hội thoại, bạn thử lại sau nhé." },
        { status: 502 },
      );
    }
    conversationId = data.id as string;
    cookieStore.set(CONVERSATION_COOKIE, conversationId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Không set maxAge/expires: cookie phiên, mất khi đóng hẳn trình duyệt.
    });
  }

  const { data: priorMessages, error: historyError } = await supabase
    .from("messages")
    .select("sender, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (historyError) {
    console.error("Supabase select history failed:", historyError);
    return NextResponse.json(
      { error: "Không đọc được lịch sử hội thoại, bạn thử lại sau nhé." },
      { status: 502 },
    );
  }

  const { error: insertUserError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender: "user",
    content: message,
  });
  if (insertUserError) {
    console.error("Supabase insert user message failed:", insertUserError);
    return NextResponse.json(
      { error: "Không lưu được tin nhắn, bạn thử lại sau nhé." },
      { status: 502 },
    );
  }

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [
          ...buildContents((priorMessages ?? []) as DbMessage[]),
          { role: "user", parts: [{ text: message }] },
        ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Gemini API error:", res.status, errBody);
      return NextResponse.json(
        { error: "Chatbot đang gặp sự cố, bạn thử lại sau nhé." },
        { status: 502 },
      );
    }

    const data = await res.json();
    const reply: string | undefined = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();

    if (!reply) {
      return NextResponse.json(
        { error: "Chatbot chưa có câu trả lời, bạn thử hỏi lại theo cách khác nhé." },
        { status: 502 },
      );
    }

    const nowIso = new Date().toISOString();
    const { error: insertBotError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "bot",
      content: reply,
    });
    if (insertBotError) {
      console.error("Supabase insert bot message failed:", insertBotError);
    }
    const { error: updateConvError } = await supabase
      .from("conversations")
      .update({ last_message_at: nowIso })
      .eq("id", conversationId);
    if (updateConvError) {
      console.error("Supabase update conversation failed:", updateConvError);
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Gemini API request failed:", err);
    return NextResponse.json(
      { error: "Không kết nối được tới chatbot, bạn thử lại sau nhé." },
      { status: 502 },
    );
  }
}
