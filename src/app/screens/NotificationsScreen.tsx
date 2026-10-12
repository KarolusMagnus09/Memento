import { ChevronLeft } from "lucide-react";
import type { Screen } from "../types";
import { TEAL, BG } from "../constants";
import { Toggle } from "../components/shared/Toggle";
import { useState } from "react";

type ReminderKey = "dayBefore" | "hours4" | "hours24";

export default function NotificationsScreen({ setScreen }: { setScreen: (s: Screen) => void }) {
  const [master, setMaster] = useState(true);
  const [orderAccepted, setOrderAccepted] = useState(true);
  const [newMessage, setNewMessage] = useState(true);
  const [reminderOn, setReminderOn] = useState(true);
  const [reminders, setReminders] = useState<Record<ReminderKey, boolean>>({
    dayBefore: true,
    hours4: true,
    hours24: true,
  });

  const toggleReminder = (key: ReminderKey) => setReminders(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="flex flex-col min-h-screen pb-10" style={{ background: BG }}>
      <div className="px-5 py-4 relative flex items-center gap-3" style={{ background: TEAL }}>
        <button onClick={() => setScreen("profile")} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
          <ChevronLeft size={18} strokeWidth={2.5} className="text-white" />
        </button>
        <h2 className="font-bold text-base text-white">Cài đặt Thông báo</h2>
      </div>

      <div className="px-5 mt-4 flex flex-col gap-4">
        {/* Master toggle */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1">
              <p className="text-sm font-bold">Thông báo</p>
              <p className="text-xs text-muted-foreground">Bật/tắt toàn bộ thông báo của ứng dụng</p>
            </div>
            <Toggle on={master} onToggle={() => setMaster(!master)} />
          </div>
        </div>

        <div className={master ? "flex flex-col gap-4" : "flex flex-col gap-4 opacity-40 pointer-events-none"}>
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <div className="flex-1">
                <p className="text-sm font-semibold">Photographer nhận lịch</p>
                <p className="text-xs text-muted-foreground">Khi photographer đồng ý nhận lịch chụp của bạn</p>
              </div>
              <Toggle on={master && orderAccepted} onToggle={() => setOrderAccepted(!orderAccepted)} />
            </div>

            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <div className="flex-1">
                <p className="text-sm font-semibold">Tin nhắn mới</p>
                <p className="text-xs text-muted-foreground">Khi có người nhắn tin cho bạn</p>
              </div>
              <Toggle on={master && newMessage} onToggle={() => setNewMessage(!newMessage)} />
            </div>

            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <div className="flex-1">
                <p className="text-sm font-semibold">Sắp tới giờ hẹn</p>
                <p className="text-xs text-muted-foreground">Nhắc trước khi tới buổi chụp đã đặt lịch</p>
              </div>
              <Toggle on={master && reminderOn} onToggle={() => setReminderOn(!reminderOn)} />
            </div>

            {/* Sub-options của "Sắp tới giờ hẹn" */}
            <div className={(master && reminderOn) ? "bg-muted/40" : "bg-muted/40 opacity-40 pointer-events-none"}>
              <div className="flex items-center gap-3 pl-8 pr-4 py-3 border-b border-border">
                <div className="flex-1">
                  <p className="text-xs font-semibold">Nếu mai có lịch hẹn</p>
                  <p className="text-xs text-muted-foreground">Báo vào buổi tối hôm trước</p>
                </div>
                <Toggle on={master && reminderOn && reminders.dayBefore} onToggle={() => toggleReminder("dayBefore")} />
              </div>
              <div className="flex items-center gap-3 pl-8 pr-4 py-3 border-b border-border">
                <div className="flex-1">
                  <p className="text-xs font-semibold">Báo trước 24 giờ</p>
                </div>
                <Toggle on={master && reminderOn && reminders.hours24} onToggle={() => toggleReminder("hours24")} />
              </div>
              <div className="flex items-center gap-3 pl-8 pr-4 py-3">
                <div className="flex-1">
                  <p className="text-xs font-semibold">Báo trước 4 giờ</p>
                </div>
                <Toggle on={master && reminderOn && reminders.hours4} onToggle={() => toggleReminder("hours4")} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
