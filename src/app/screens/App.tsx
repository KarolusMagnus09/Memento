import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import type { Screen, Photographer } from "./types";
import { BG } from "./constants";
import { usePhotographers } from "./hooks/usePhotographers";
import { useProfile } from "./hooks/useProfile";
import { BottomNav } from "./components/shared/BottomNav";

import LoginScreen from "./screens/LoginScreen";
import OnboardingFlow from "./screens/onboarding/OnboardingFlow";
import HomeScreen from "./screens/HomeScreen";
import SearchScreen from "./screens/SearchScreen";
import PhotographerProfileScreen from "./screens/PhotographerProfileScreen";
import WriteReviewScreen from "./screens/WriteReviewScreen";
import ReviewsListScreen from "./screens/ReviewsListScreen";
import BookingScreen from "./screens/BookingScreen";
import BookingConfirmScreen from "./screens/BookingConfirmScreen";
import BookingsScreen from "./screens/BookingsScreen";
import MessagesScreen from "./screens/MessagesScreen";
import ChatScreen from "./screens/ChatScreen";
import ProfileScreen from "./screens/ProfileScreen";
import PersonalInfoScreen from "./screens/PersonalInfoScreen";
import SettingsScreen from "./screens/SettingsScreen";
import ChangeEmailFlow from "./screens/ChangeEmailFlow";
import ChangePasswordFlow from "./screens/ChangePasswordFlow";
import BecomePhotographerScreen from "./screens/BecomePhotographerScreen";
import ContactUsScreen from "./screens/ContactUsScreen";
import NotificationsScreen from "./screens/NotificationsScreen";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [tab, setTab] = useState("home");
  const [savedIds, setSavedIds] = useState<number[]>([]);

  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  // Màn "Cài đặt" tái dùng cơ chế gửi OTP kiểu "recovery" để xác minh email
  // hiện tại (không phải để đổi mật khẩu thật), nên khi nó đang chạy, cần
  // báo cho listener bên dưới BỎ QUA sự kiện PASSWORD_RECOVERY — nếu không,
  // app sẽ tưởng người dùng đang quên mật khẩu và tự đá về màn đăng nhập.
  const ignoreRecoveryRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
      if (data.session) setScreen(s => (s === "login" ? "home" : s));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") {
        if (ignoreRecoveryRef.current) return;
        setIsPasswordRecovery(true);
        return;
      }
      if (newSession) {
        setScreen(s => (s === "login" ? "home" : s));
      } else {
        setScreen("login");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const { profile, loading: profileLoading, error: profileError, refresh: refreshProfile } = useProfile(session?.user.id ?? null);
  const { photographers, loading, error } = usePhotographers();
  const [activePhotographer, setActivePhotographer] = useState<Photographer | null>(null);
  const [chatPartner, setChatPartner] = useState<Photographer | null>(null);
  /** Đang xem hồ sơ PTG của chính mình (từ menu Profile) */
  const [viewingOwnProfile, setViewingOwnProfile] = useState(false);
  const [ownAppStatus, setOwnAppStatus] = useState<"draft" | "submitted" | "approved" | "rejected" | null>(null);

  // Once data arrives, default the "active" photographer to the first one
  // so screens like photographer-profile/booking have something to show.
  useEffect(() => {
    if (photographers.length > 0 && !activePhotographer) {
      setActivePhotographer(photographers[0]);
      setChatPartner(photographers[0]);
    }
  }, [photographers, activePhotographer]);

  const toggleSave = (id: number) => setSavedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const showNav = !["login", "chat", "booking-confirm", "personal-info", "change-email", "change-password", "become-photographer"].includes(screen);

  const navigateTo = (s: Screen) => {
    setScreen(s);
    if (["home", "search", "bookings", "messages", "profile"].includes(s)) {
      setTab(s);
      setViewingOwnProfile(false);
    }
  };

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#e5e7e5" }}>
        <p className="text-sm text-muted-foreground">Đang tải...</p>
      </div>
    );
  }

  if (!session || isPasswordRecovery) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#e5e7e5" }}>
        <div className="relative w-full max-w-sm" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
          <LoginScreen onAuthed={() => { setIsPasswordRecovery(false); setScreen("home"); }} />
        </div>
      </div>
    );
  }

  // Đã đăng nhập nhưng đang tải hồ sơ (profiles) — cần biết onboarding_completed
  // trước khi quyết định show Onboarding hay app chính.
  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#e5e7e5" }}>
        <p className="text-sm text-muted-foreground">Đang tải hồ sơ...</p>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="flex items-center justify-center min-h-screen px-6 text-center" style={{ background: "#e5e7e5" }}>
        <p className="text-sm text-red-600">Không tải được hồ sơ: {profileError}.</p>
      </div>
    );
  }

  // User mới toanh (vừa xác nhận OTP đăng ký) chưa đi qua onboarding →
  // bắt điền tên hiển thị / ảnh / giới tính / SĐT theo kiểu Facebook trước
  // khi vào app chính.
  if (profile && !profile.onboarding_completed) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#e5e7e5" }}>
        <div className="relative w-full max-w-sm" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
          <OnboardingFlow userId={session.user.id} profile={profile} onDone={refreshProfile} />
        </div>
      </div>
    );
  }

  // Screens that don't need real photographer data can render immediately.
  const needsData = !["login", "profile", "personal-info", "privacy", "become-photographer", "contact-us", "notifications", "change-email", "change-password"].includes(screen);

  if (needsData && loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#e5e7e5" }}>
        <p className="text-sm text-muted-foreground">Đang tải dữ liệu...</p>
      </div>
    );
  }

  if (needsData && error) {
    return (
      <div className="flex items-center justify-center min-h-screen px-6 text-center" style={{ background: "#e5e7e5" }}>
        <p className="text-sm text-red-600">
          Không tải được dữ liệu từ Supabase: {error}.<br />
          Kiểm tra file .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) và bảng "photographers".
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[100dvh]" style={{ background: "#e5e7e5" }}>
      {/* Khung app: chiều cao cố định + vùng giữa cuộn được (vuốt lên/xuống) */}
      <div
        className="relative w-full max-w-sm h-[100dvh] flex flex-col overflow-hidden"
        style={{ fontFamily: "'Be Vietnam Pro', sans-serif", background: BG }}
      >
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain no-scrollbar touch-scroll"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          {screen === "home" && <HomeScreen setScreen={(s) => { setViewingOwnProfile(false); navigateTo(s); }} setPhotographer={(p) => { setViewingOwnProfile(false); setActivePhotographer(p); }} savedIds={savedIds} toggleSave={toggleSave} photographers={photographers} profile={profile} />}
          {screen === "search" && <SearchScreen setScreen={(s) => { setViewingOwnProfile(false); navigateTo(s); }} setPhotographer={(p) => { setViewingOwnProfile(false); setActivePhotographer(p); }} savedIds={savedIds} toggleSave={toggleSave} photographers={photographers} />}
          {screen === "photographer-profile" && activePhotographer && (
            <PhotographerProfileScreen
              photographer={activePhotographer}
              setScreen={navigateTo}
              savedIds={savedIds}
              toggleSave={toggleSave}
              isOwner={viewingOwnProfile}
              applicationStatus={viewingOwnProfile ? ownAppStatus : null}
            />
          )}
          {screen === "write-review" && activePhotographer && <WriteReviewScreen photographer={activePhotographer} setScreen={navigateTo} />}
          {screen === "reviews-list" && activePhotographer && <ReviewsListScreen photographer={activePhotographer} setScreen={navigateTo} />}
          {screen === "booking" && activePhotographer && <BookingScreen photographer={activePhotographer} setScreen={navigateTo} />}
          {screen === "booking-confirm" && activePhotographer && <BookingConfirmScreen photographer={activePhotographer} setScreen={navigateTo} setTab={setTab} />}
          {screen === "bookings" && <BookingsScreen setScreen={navigateTo} setPhotographer={setActivePhotographer} photographers={photographers} />}
          {screen === "messages" && <MessagesScreen setScreen={navigateTo} setChatPartner={setChatPartner} photographers={photographers} />}
          {screen === "chat" && chatPartner && <ChatScreen photographer={chatPartner} setScreen={navigateTo} />}
          {screen === "profile" && profile && (
            <ProfileScreen
              setScreen={navigateTo}
              profile={profile}
              onOpenOwnPhotographerProfile={(p, status) => {
                setActivePhotographer(p);
                setViewingOwnProfile(true);
                setOwnAppStatus(status);
                setScreen("photographer-profile");
              }}
            />
          )}
          {screen === "personal-info" && profile && <PersonalInfoScreen setScreen={navigateTo} profile={profile} refreshProfile={refreshProfile} />}
          {(screen === "profile" || screen === "personal-info") && !profile && (
            <div className="flex items-center justify-center min-h-full px-6 text-center">
              <p className="text-sm text-muted-foreground">Không tải được hồ sơ. Bạn thử tải lại trang nhé.</p>
            </div>
          )}
          {screen === "privacy" && <SettingsScreen setScreen={navigateTo} profile={profile} />}
          {screen === "change-email" && <ChangeEmailFlow setScreen={navigateTo} profile={profile} refreshProfile={refreshProfile} setIgnoreRecoveryEvent={v => { ignoreRecoveryRef.current = v; }} />}
          {screen === "change-password" && <ChangePasswordFlow setScreen={navigateTo} profile={profile} setIgnoreRecoveryEvent={v => { ignoreRecoveryRef.current = v; }} />}
          {screen === "become-photographer" && <BecomePhotographerScreen setScreen={navigateTo} profile={profile} refreshProfile={refreshProfile} />}
          {screen === "contact-us" && <ContactUsScreen setScreen={navigateTo} profile={profile} />}
          {screen === "notifications" && <NotificationsScreen setScreen={navigateTo} />}
        </div>

        {showNav && <BottomNav tab={tab} setTab={setTab} setScreen={navigateTo} />}
      </div>
    </div>
  );
}
