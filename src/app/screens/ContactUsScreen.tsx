import { ChevronLeft, Mail, CheckCircle2 } from "lucide-react";
import type { Screen } from "../types";
import type { Profile } from "../hooks/useProfile";
import { TEAL, TEAL_MID, BG } from "../constants";
import { useState } from "react";
import emailjs from "@emailjs/browser";

// ── Cấu hình EmailJS ───────────────────────────────────────────────────
// Gửi email KHÔNG cần mở app mail — email sẽ được gửi thẳng tới hộp thư hỗ
// trợ ngay khi người dùng bấm nút, thông qua dịch vụ EmailJS (miễn phí,
// không cần server riêng). Lấy 3 giá trị dưới đây từ tài khoản EmailJS đã
// nối với Gmail mementocustomersupport@gmail.com — xem hướng dẫn lấy ở
// phần chat, sau đó dán thay vào đây.
const EMAILJS_SERVICE_ID = "service_f2sph86";
const EMAILJS_TEMPLATE_ID = "template_s2j4wug";
const EMAILJS_PUBLIC_KEY = "ATfzf7zUhhyxQGRws";

const SUPPORT_EMAIL = "mementoffical@gmail.com";

export default function ContactUsScreen({ setScreen, profile }: { setScreen: (s: Screen) => void; profile: Profile | null }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!message.trim()) { setError("Vui lòng mô tả vấn đề bạn đang gặp phải."); return; }
    setError(null);
    setSending(true);
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          title: subject || "Hỗ trợ từ ứng dụng Memento",
          message,
          name: profile?.full_name || profile?.username || "Người dùng Memento",
          email: profile?.email || SUPPORT_EMAIL,
          time: new Date().toLocaleString("vi-VN"),
        },
        { publicKey: EMAILJS_PUBLIC_KEY }
      );
      setSent(true);
    } catch (e) {
      setError("Gửi thất bại, vui lòng thử lại sau ít phút.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-8 text-center" style={{ background: BG }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "#e8f5f0" }}>
          <CheckCircle2 size={32} style={{ color: TEAL }} />
        </div>
        <h2 className="font-black text-xl mb-2" style={{ color: TEAL }}>Đã gửi!</h2>
        <p className="text-sm text-muted-foreground mb-8">
          Cảm ơn bạn đã liên hệ. Đội ngũ Memento sẽ phản hồi qua email sớm nhất có thể.
        </p>
        <button onClick={() => setScreen("profile")}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
          Quay lại Hồ sơ
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-24" style={{ background: BG }}>
      <div className="px-5 pt-12 pb-4 bg-white border-b border-border flex items-center gap-3">
        <button onClick={() => setScreen("profile")} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <ChevronLeft size={18} />
        </button>
        <div>
          <h2 className="font-black text-xl" style={{ color: TEAL }}>Liên hệ hỗ trợ</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Gửi câu hỏi hoặc phản hồi cho đội ngũ Memento</p>
        </div>
      </div>

      <div className="px-5 mt-5 flex flex-col gap-4">
        <div className="bg-white rounded-2xl p-4 border border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#e8f5f0" }}>
            <Mail size={18} style={{ color: TEAL }} />
          </div>
          <div className="min-w-0 flex-1 pr-2">
            <p className="text-xs text-muted-foreground">Email hỗ trợ</p>
            <p className="text-[11px] font-bold whitespace-nowrap" style={{ color: TEAL }}>{SUPPORT_EMAIL}</p>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tiêu đề</label>
          <div className="flex items-center gap-2 mt-1 mb-4 px-3 py-3 rounded-xl border border-border bg-input-background">
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none" placeholder="Ví dụ: Không thanh toán được" />
          </div>

          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nội dung</label>
          <textarea value={message} onChange={e => { setMessage(e.target.value); setError(null); }}
            rows={6}
            className="w-full mt-1 px-3 py-3 rounded-xl border border-border bg-input-background text-sm outline-none resize-none"
            placeholder="Mô tả vấn đề bạn đang gặp phải..." />
        </div>

        {error && <p className="text-xs text-red-600 text-center">{error}</p>}

        <button onClick={handleSend} disabled={sending}
          className="w-full py-3.5 rounded-2xl text-white font-bold text-base shadow-md active:scale-95 transition-transform disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_MID} 100%)` }}>
          {sending ? "Đang gửi..." : "Gửi email hỗ trợ"}
        </button>
        <p className="text-xs text-muted-foreground text-center">
          Email sẽ được gửi thẳng tới đội ngũ hỗ trợ, đội ngũ của chúng tôi sẽ xử lý các tin nhắn theo thứ tự mà chúng tôi nhận được và sẽ sớm xử lý tin của bạn. Mong bạn thông cảm và chờ đợi trong thời gian này.
        </p>
      </div>
    </div>
  );
}
