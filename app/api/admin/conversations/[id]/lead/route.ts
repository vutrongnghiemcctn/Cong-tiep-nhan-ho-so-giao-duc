import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MODEL = "gemini-3.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const EXTRACTION_SYSTEM_INSTRUCTION = `Bạn là hệ thống trích xuất thông tin lead từ đoạn hội thoại tư vấn du học dưới đây, giữa khách (Khách) và trợ lý ảo (Trợ lý). Đọc kỹ toàn bộ hội thoại và trích xuất đúng các trường theo schema, CHỈ dựa trên thông tin khách thực sự đã cung cấp trong hội thoại — không suy đoán, không bịa thêm.

Diễn giải từng trường:
- full_name: họ tên khách
- email: email liên hệ của khách
- phone: số điện thoại liên hệ của khách
- country: quốc gia khách muốn du học
- education_level: bậc học khách quan tâm (THPT, Đại học, Thạc sĩ...)
- major: ngành học khách quan tâm
- availability: thời gian khách rảnh để được tư vấn, nếu khách có nhắc tới
- booked_consultation: true nếu khách đã đồng ý/xác nhận muốn đặt lịch tư vấn, false nếu chưa hoặc không rõ
- notes: tóm tắt ngắn gọn (1-2 câu) các điểm đáng chú ý khác trong hội thoại — nhu cầu đặc biệt, băn khoăn, ngữ cảnh quan trọng
- quality: đánh giá chất lượng lead — "good" nếu khách cung cấp đủ thông tin liên hệ thật (tên + email hoặc số điện thoại) và có nhu cầu du học rõ ràng; "ok" nếu khách có quan tâm thật nhưng thông tin liên hệ chưa đầy đủ; "spam" nếu hội thoại vô nghĩa, spam, test, hoặc rõ ràng không có nhu cầu thật

Nếu một trường không có thông tin trong hội thoại, để giá trị null (trừ booked_consultation và quality luôn phải có giá trị).`;

const LEAD_SCHEMA = {
  type: "OBJECT",
  properties: {
    full_name: { type: "STRING", nullable: true },
    email: { type: "STRING", nullable: true },
    phone: { type: "STRING", nullable: true },
    country: { type: "STRING", nullable: true },
    education_level: { type: "STRING", nullable: true },
    major: { type: "STRING", nullable: true },
    availability: { type: "STRING", nullable: true },
    booked_consultation: { type: "BOOLEAN" },
    notes: { type: "STRING", nullable: true },
    quality: { type: "STRING", enum: ["good", "ok", "spam"] },
  },
  required: ["booked_consultation", "quality"],
};

interface ExtractedLead {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  education_level: string | null;
  major: string | null;
  availability: string | null;
  booked_consultation: boolean;
  notes: string | null;
  quality: "good" | "ok" | "spam";
}

function isValidQuality(q: unknown): q is ExtractedLead["quality"] {
  return q === "good" || q === "ok" || q === "spam";
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Chưa cấu hình GEMINI_API_KEY trên server." },
      { status: 500 },
    );
  }

  const { id: conversationId } = await params;
  const supabase = getSupabaseAdmin();

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("sender, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (messagesError) {
    console.error("Supabase select messages failed:", messagesError);
    return NextResponse.json(
      { error: "Không đọc được hội thoại, thử lại sau nhé." },
      { status: 502 },
    );
  }

  if (!messages || messages.length === 0) {
    return NextResponse.json(
      { error: "Hội thoại chưa có tin nhắn nào để trích xuất." },
      { status: 400 },
    );
  }

  const transcript = messages
    .map((m) => `${m.sender === "user" ? "Khách" : "Trợ lý"}: ${m.content}`)
    .join("\n");

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: EXTRACTION_SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text: transcript }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: LEAD_SCHEMA,
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Gemini extract-lead error:", res.status, errBody);
      return NextResponse.json(
        { error: "Không trích xuất được thông tin lead, thử lại sau nhé." },
        { status: 502 },
      );
    }

    const data = await res.json();
    const rawText: string | undefined = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("");

    if (!rawText) {
      return NextResponse.json(
        { error: "Gemini không trả về kết quả, thử lại sau nhé." },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      console.error("Failed to parse lead JSON:", err, rawText);
      return NextResponse.json(
        { error: "Kết quả trích xuất không đúng định dạng, thử lại sau nhé." },
        { status: 502 },
      );
    }

    const obj = (parsed ?? {}) as Record<string, unknown>;
    const lead: ExtractedLead = {
      full_name: typeof obj.full_name === "string" ? obj.full_name : null,
      email: typeof obj.email === "string" ? obj.email : null,
      phone: typeof obj.phone === "string" ? obj.phone : null,
      country: typeof obj.country === "string" ? obj.country : null,
      education_level: typeof obj.education_level === "string" ? obj.education_level : null,
      major: typeof obj.major === "string" ? obj.major : null,
      availability: typeof obj.availability === "string" ? obj.availability : null,
      booked_consultation: obj.booked_consultation === true,
      notes: typeof obj.notes === "string" ? obj.notes : null,
      quality: isValidQuality(obj.quality) ? obj.quality : "ok",
    };

    const { data: saved, error: upsertError } = await supabase
      .from("leads")
      .upsert(
        { conversation_id: conversationId, ...lead, extracted_at: new Date().toISOString() },
        { onConflict: "conversation_id" },
      )
      .select()
      .single();

    if (upsertError || !saved) {
      console.error("Supabase upsert lead failed:", upsertError);
      return NextResponse.json(
        { error: "Không lưu được thông tin lead, thử lại sau nhé." },
        { status: 502 },
      );
    }

    return NextResponse.json({ lead: saved });
  } catch (err) {
    console.error("Extract lead request failed:", err);
    return NextResponse.json(
      { error: "Không kết nối được tới Gemini, thử lại sau nhé." },
      { status: 502 },
    );
  }
}
