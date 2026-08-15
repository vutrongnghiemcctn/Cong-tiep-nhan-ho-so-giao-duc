# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Về dự án

`DuHoc24` — website mẫu "Cổng Tiếp Nhận Hồ Sơ Du Học", dùng cho khoá lập trình 6 tuần. Phần lớn app
vẫn dùng **dữ liệu giả viết cứng** trong [lib/mock-data.ts](lib/mock-data.ts) (portal, admin, form
báo giá) — chưa nối database hay auth thật. Ngoại lệ: chatbot ở trang chủ đã có API route thật
([app/api/chat/route.ts](app/api/chat/route.ts)) gọi Gemini. Đừng giả định các phần còn lại có
backend thật trừ khi thấy code gọi thật (Supabase client, API route khác, v.v.).

Lộ trình các tuần tiếp theo (Supabase + form thật, đọc/trích xuất hồ sơ bằng Gemini, tự động hoá
Make.com, auth qua magic link) được liệt kê chi tiết trong [README.md](README.md) — đọc phần đó nếu
task liên quan đến việc "nối dữ liệu thật" cho một trang cụ thể, để biết trang đó thuộc tuần nào và
nên nối gì.

## Lệnh thường dùng

```bash
npm install       # cài dependency
npm run dev       # chạy dev server tại http://localhost:3000
npm run build     # build production
npm run start     # chạy bản đã build
npm run lint      # eslint (eslint-config-next core-web-vitals + typescript)
```

Không có bộ test nào trong repo hiện tại.

## Kiến trúc

- **Next.js 16 App Router**, React 19, TypeScript strict, Tailwind CSS v4. Toàn bộ style qua
  utility class, biến CSS khai báo trong [app/globals.css](app/globals.css) (base color `neutral`,
  không prefix).
- **shadcn/ui, style `base-nova`** trên nền [Base UI](https://base-ui.com) (`@base-ui/react`, không
  phải Radix). Component nguyên bản nằm ở `components/ui/*`; đây là code do `shadcn` CLI generate,
  chỉnh sửa trực tiếp như code thường của repo (không phải dependency ngoài). Alias trong
  [components.json](components.json): `@/components`, `@/components/ui`, `@/lib`, `@/hooks`.
- Khối giao diện landing page nền tảng dựa trên registry `@tailark-oss/dusk-landing-2`, đã chuyển
  sang light theme và tuỳ biến nội dung — khi sửa `components/landing/*`, ưu tiên giữ cấu trúc gốc
  của khối thay vì viết lại từ đầu.
- **3 khu vực route độc lập**, mỗi khu vực có UI/mục đích riêng:
  - `/` — landing page (hero, form báo giá, chatbot hỏi-đáp, highlights, footer). Dùng
    `components/landing/*`, `site-header`, `site-footer`.
  - `/portal` — cổng học viên (upload giấy tờ, thông tin trích xuất, đối chiếu điểm chuẩn). Dùng
    `components/portal/*`, dữ liệu mẫu từ `currentStudent` trong `lib/mock-data.ts`.
  - `/admin/*` — khu vực quản trị, có layout riêng ([app/admin/layout.tsx](app/admin/layout.tsx))
    với sidebar cố định (`components/admin/sidebar.tsx`) bọc toàn bộ trang con:
    `requests`, `schools`, `profiles`, `conversations`. `/admin` tự chuyển hướng sang `/admin/requests`.
- **[app/api/chat/route.ts](app/api/chat/route.ts)** — API route thật đầu tiên của app, đứng sau
  chatbot ở [components/landing/chat-widget.tsx](components/landing/chat-widget.tsx). Nhận
  `{ message, history }`, gọi Gemini (`GEMINI_API_KEY`, chỉ dùng server-side) với system instruction
  nhúng nguyên bộ câu hỏi/đáp cố định — model bị ép chỉ trả lời trong phạm vi bộ QnA đó, từ chối lịch
  sự nếu hỏi ngoài phạm vi. Sửa nội dung QnA thì sửa trực tiếp mảng `QNA` trong file này.
- **`lib/mock-data.ts` là nguồn dữ liệu và kiểu dữ liệu duy nhất** cho phần dữ liệu mock — các type
  domain chính (`School`, `AdmissionRequest`, `StudentProfile`, `Conversation`, `DocStatus`,
  `RequestStatus`, `ServicePackage`) đều định nghĩa ở đây và được import khắp `app/` và `components/`.
  Khi thêm field/entity mới, sửa ở đây trước rồi mới lan ra UI.
- **`components/status-badge.tsx`** là nơi ánh xạ tập trung từ trạng thái (`DocStatus`,
  `RequestStatus`) sang label tiếng Việt + màu + icon (`docStatusMeta`, `requestStatusMeta`) — dùng
  lại các badge này (`DocStatusBadge`, `RequestStatusBadge`) thay vì tự tạo màu/label mới cho trạng thái.
- Toàn bộ UI-facing text là **tiếng Việt**; giữ nguyên ngôn ngữ này khi thêm nội dung mới.
- Biến môi trường nằm trong `.env` (không commit — xem Quy tắc Git, không có `.env.example` mẫu ở
  bản này). Hiện có `GEMINI_API_KEY` (dùng bởi `app/api/chat/route.ts`); các biến Supabase/site URL
  còn lại kế thừa từ template ban đầu, chưa dùng ở phần còn lại của app.

## Quy tắc Git

- Luôn hỏi xác nhận trước khi push lên Github.
- Không bao giờ commit file `.env` hoặc bất kỳ file chứa API key.
