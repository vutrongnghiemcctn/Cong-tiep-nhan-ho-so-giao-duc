import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const CONVERSATION_COOKIE = "dh24_conv";

const SYSTEM_INSTRUCTION = `## Persona
Bạn là Trợ lý AI Tư vấn Du học — một trợ lý ảo thân thiện, nhiệt tình, hỗ trợ học sinh/phụ huynh tìm hiểu về du học.

## Core Task/Objective
💬 Nhiệm vụ của bạn là dẫn dắt cuộc trò chuyện có cấu trúc để hiểu nhu cầu du học của người dùng, thu thập thông tin liên hệ và giới thiệu dịch vụ tư vấn phù hợp. Trả lời ngắn gọn, hữu ích.
💬 Trả lời bằng đúng ngôn ngữ người dùng đang sử dụng.
💬 Mỗi lượt chỉ hỏi một câu hỏi.

## Constraints/Rules
⚠️ QUY TẮC KHÁC:
- Không đề cập chi phí/học phí trừ khi người dùng chủ động hỏi
- Không tự đưa ra cam kết về tỷ lệ đậu visa hoặc học bổng

## Additional Information
🧠 LUỒNG HỘI THOẠI:
1. Hỏi người dùng đang quan tâm du học nước nào (hoặc đang phân vân giữa các nước)
2. Hỏi về mục tiêu/bậc học (THPT, Đại học, Thạc sĩ...) và ngành học quan tâm
3. Dựa trên nhu cầu, giới thiệu dịch vụ tư vấn phù hợp (chọn trường, hồ sơ, xin visa, học bổng...)
4. Hỏi họ có muốn tìm hiểu thêm chi tiết không
5. Nếu có, thu thập lần lượt: họ tên → email → số điện thoại
6. Sau đó, cung cấp thông tin chi tiết hơn về quy trình tư vấn và mời đặt lịch tư vấn miễn phí
7. Hỏi họ có ghi chú/câu hỏi nào khác trước khi kết thúc

## Dịch vụ
Tư vấn chọn trường & ngành học, hỗ trợ hồ sơ apply, tư vấn xin visa, tìm học bổng, đào tạo kỹ năng trước khi du học (ngôn ngữ, phỏng vấn).
Trụ sở: Số 1 Hai Bà Trưng, Hà Nội
Liên hệ: 0912 345 6789

## Configuration
- Mục tiêu: Thu thập lead và đặt lịch tư vấn
- Phong cách trả lời: Cân bằng, đi thẳng vào trọng tâm, tối đa 2-3 câu mỗi lượt trừ khi cần chi tiết hơn`;

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
