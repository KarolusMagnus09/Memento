import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";
import { fetchPins, setPinned } from "./lib/social";
import type { Session } from "@supabase/supabase-js";
import type { Screen, Photographer } from "./types";
import { BG } from "./constants";
import { usePhotographers } from "./hooks/usePhotographers";
import { useProfile } from "./hooks/useProfile";
import { BottomNav } from "./components/shared/BottomNav";
import { ChatToast } from "./components/shared/ChatToast";
import { useChatNotifications } from "./hooks/useChatNotifications";
import type { ChatTarget } from "./lib/chat";

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
import ProfileScreen, { mapApplicationToPhotographer } from "./screens/ProfileScreen";
import PersonalInfoScreen from "./screens/PersonalInfoScreen";
import SettingsScreen from "./screens/SettingsScreen";
import ChangeEmailFlow from "./screens/ChangeEmailFlow";
import ChangePasswordFlow from "./screens/ChangePasswordFlow";
import BecomePhotographerScreen from "./screens/BecomePhotographerScreen";
import ContactUsScreen from "./screens/ContactUsScreen";
import NotificationsScreen from "./screens/NotificationsScreen";
import AdminReviewScreen from "./screens/AdminReviewScreen";
import EditPhotographerProfileScreen from "./screens/EditPhotographerProfileScreen";

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
  const { photographers, loading, error, refresh: refreshPhotographers } = usePhotographers();
  const [activePhotographer, setActivePhotographer] = useState<Photographer | null>(null);

  // Danh sách photographer đã ghim: nạp từ server khi đăng nhập
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) {
      setSavedIds([]);
      return;
    }
    let alive = true;
    fetchPins().then((ids) => { if (alive) setSavedIds(ids); });
    return () => { alive = false; };
  }, [session?.user.id]);
  // Chat: cuộc trò chuyện đang mở + màn sẽ quay về khi bấm Back
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  const [chatBack, setChatBack] = useState<Screen>("messages");
  // Badge tin chưa đọc + banner tin mới (realtime). Phải gọi trước các `return` sớm bên dưới.
  const { unread, toast: chatToast, dismissToast, refreshUnread } = useChatNotifications(
    session?.user.id ?? null,
    screen === "chat" && chatTarget ? chatTarget.id : null,
  );
  const openChat = (t: ChatTarget, from: Screen = "messages") => {
    setChatTarget(t);
    setChatBack(from);
    setScreen("chat");
  };
  /** Đang xem hồ sơ PTG của chính mình (từ menu Profile) */
  const [viewingOwnProfile, setViewingOwnProfile] = useState(false);
  const [ownAppStatus, setOwnAppStatus] = useState<"draft" | "submitted" | "approved" | "rejected" | null>(null);
  const [ownRejectionNote, setOwnRejectionNote] = useState<string | null>(null);

  // Once data arrives, default the "active" photographer to the first one
  // so screens like photographer-profile/booking have something to show.
  useEffect(() => {
    if (photographers.length > 0 && !activePhotographer) {
      setActivePhotographer(photographers[0]);
    }
  }, [photographers, activePhotographer]);

  // Sau khi PTG lưu cập nhật hồ sơ: tải lại danh sách (Home/Search) và hồ sơ của chính mình
  async function handleProfileSaved() {
    refreshPhotographers();
    if (!session?.user.id || !profile) return;
    const { data: app } = await supabase
      .from("photographer_applications")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (app) {
      setActivePhotographer(mapApplicationToPhotographer(app as Record<string, unknown>, profile));
      setViewingOwnProfile(true);
      setOwnAppStatus((app.status as typeof ownAppStatus) ?? "approved");
      setOwnRejectionNote((app.admin_note as string) ?? null);
    }
  }

  // Ghim / bỏ ghim: 1 state dùng chung Home + Khám phá + hồ sơ; lưu server; lỗi thì rollback
  const toggleSave = (id: number) => {
    const pid = Number(id);
    if (!Number.isFinite(pid)) return;
    const wasPinned = savedIds.some((x) => Number(x) === pid);
    setSavedIds((prev) =>
      wasPinned ? prev.filter((x) => Number(x) !== pid) : [...prev.map(Number).filter(Number.isFinite), pid]
    );
    setPinned(pid, !wasPinned).then((err) => {
      if (err) {
        setSavedIds((prev) =>
          wasPinned
            ? [...prev.map(Number).filter(Number.isFinite), pid]
            : prev.filter((x) => Number(x) !== pid)
        );
      }
    });
  };

  const isSaved = (id: number) => savedIds.some((x) => Number(x) === Number(id));

  // Mở hồ sơ một photographer khác theo id (từ thẻ người bình luận)
  const openPhotographerById = (pid: number) => {
    const p = photographers.find(x => x.id === pid);
    if (!p) return;
    setViewingOwnProfile(false);
    setActivePhotographer(p);
    navigateTo("photographer-profile");
  };

  const showNav = !["login", "chat", "booking-confirm", "personal-info", "change-email", "change-password", "become-photographer", "admin-review", "edit-photographer"].includes(screen);

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
        <p className="text-sm text-red-600 mb-3">Không tải được hồ sơ: {profileError}.</p>
        <button type="button" onClick={() => refreshProfile()}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "#0c3d35" }}>
          Thử lại
        </button>
      </div>
    );
  }

  // Đã login nhưng chưa có dòng profiles (trigger trễ / RLS) — KHÔNG render Home
  // (HomeScreen dùng profile.role → crash → màn trắng). Hiện loading / nút thử lại.
  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center gap-3" style={{ background: "#e5e7e5" }}>
        <p className="text-sm text-muted-foreground">Đang chuẩn bị hồ sơ...</p>
        <button type="button" onClick={() => refreshProfile()}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "#0c3d35" }}>
          Thử lại
        </button>
      </div>
    );
  }

  // User mới chưa onboarding → OnboardingFlow
  if (!profile.onboarding_completed) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "#e5e7e5" }}>
        <div className="relative w-full max-w-sm" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
          <OnboardingFlow userId={session.user.id} profile={profile} onDone={refreshProfile} />
        </div>
      </div>
    );
  }

  // Screens that don't need real photographer data can render immediately.
  const needsData = !["login", "profile", "personal-info", "privacy", "become-photographer", "contact-us", "notifications", "change-email", "change-password", "admin-review", "messages", "chat"].includes(screen);

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
    <div className="flex items-center justify-center min-h-screen" style={{ background: "#e5e7e5" }}>
      <div className="relative w-full max-w-sm" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
        <div className="relative min-h-screen overflow-hidden" style={{ background: BG }}>
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
              rejectionNote={viewingOwnProfile ? ownRejectionNote : null}
              onOpenPhotographer={openPhotographerById}
            />
          )}
          {screen === "write-review" && activePhotographer && <WriteReviewScreen photographer={activePhotographer} setScreen={navigateTo} />}
          {screen === "reviews-list" && activePhotographer && <ReviewsListScreen photographer={activePhotographer} setScreen={navigateTo} />}
          {screen === "booking" && activePhotographer && <BookingScreen photographer={activePhotographer} setScreen={navigateTo} />}
          {screen === "booking-confirm" && activePhotographer && <BookingConfirmScreen photographer={activePhotographer} setScreen={navigateTo} setTab={setTab} />}
          {screen === "bookings" && <BookingsScreen setScreen={navigateTo} setPhotographer={setActivePhotographer} photographers={photographers} onOpenChat={(t) => openChat(t, "bookings")} />}
          {screen === "messages" && <MessagesScreen userId={session.user.id} onOpenChat={openChat} />}
          {screen === "chat" && chatTarget && <ChatScreen key={chatTarget.id} target={chatTarget} userId={session.user.id} backTo={chatBack} setScreen={navigateTo} onRead={refreshUnread} />}
          {screen === "profile" && profile && (
            <ProfileScreen
              setScreen={navigateTo}
              profile={profile}
              onOpenOwnPhotographerProfile={(p, status, note) => {
                setActivePhotographer(p);
                setViewingOwnProfile(true);
                setOwnAppStatus(status);
                setOwnRejectionNote(note ?? null);
                setScreen("photographer-profile");
              }}
            />
          )}
          {screen === "personal-info" && profile && <PersonalInfoScreen setScreen={navigateTo} profile={profile} refreshProfile={refreshProfile} />}
          {(screen === "profile" || screen === "personal-info") && !profile && (
            <div className="flex items-center justify-center min-h-screen px-6 text-center">
              <p className="text-sm text-muted-foreground">Không tải được hồ sơ. Bạn thử tải lại trang nhé.</p>
            </div>
          )}
          {screen === "privacy" && <SettingsScreen setScreen={navigateTo} profile={profile} />}
          {screen === "change-email" && <ChangeEmailFlow setScreen={navigateTo} profile={profile} refreshProfile={refreshProfile} setIgnoreRecoveryEvent={v => { ignoreRecoveryRef.current = v; }} />}
          {screen === "change-password" && <ChangePasswordFlow setScreen={navigateTo} profile={profile} setIgnoreRecoveryEvent={v => { ignoreRecoveryRef.current = v; }} />}
          {screen === "become-photographer" && <BecomePhotographerScreen setScreen={navigateTo} profile={profile} refreshProfile={refreshProfile} />}
          {screen === "contact-us" && <ContactUsScreen setScreen={navigateTo} profile={profile} />}
          {screen === "notifications" && <NotificationsScreen setScreen={navigateTo} />}
          {screen === "admin-review" && <AdminReviewScreen setScreen={navigateTo} />}
          {screen === "edit-photographer" && <EditPhotographerProfileScreen setScreen={navigateTo} onSaved={handleProfileSaved} />}

          {showNav && <BottomNav tab={tab} setTab={setTab} setScreen={navigateTo} unread={unread} />}

          {chatToast && screen !== "messages" && (
            <ChatToast
              toast={chatToast}
              onOpen={() => { openChat(chatToast.target, "messages"); setTab("messages"); dismissToast(); }}
              onClose={dismissToast}
            />
          )}
        </div>
      </div>
    </div>
  );
}
