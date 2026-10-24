import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Booking = {
  id: string;
  client_id: string;
  client_name: string | null;
  client_avatar: string | null;
  photographer_user_id: string | null;
  photographer_name: string;
  package_name: string;
  package_price: number;
  booking_date: string;
  start_time: string;
  end_time: string;
  client_note: string | null;
  ptg_note: string | null;
  status: string;
  payment_status: string | null;
  payment_ref: string | null;
  paid_at: string | null;
  deposit_paid_at: string | null;
  ptg_advance_paid_at: string | null;
  ptg_final_paid_at: string | null;
  drive_url: string | null;
  drive_submitted_at: string | null;
  handover_note: string | null;
  client_approved_at: string | null;
  shoot_done_at: string | null;
  created_at: string;
};

type Bank = {
  bank_name: string | null;
  bank_code: string | null;
  bank_account: string | null;
  bank_account_name: string | null;
};

type PhotoFeedback = {
  id: string;
  booking_id: string;
  user_id: string;
  photo_label: string;
  note: string;
  resolved: boolean;
  created_at: string;
  round?: number | null;
  images?: string[];
};

type DriveLinkChange = {
  id: string;
  old_url: string | null;
  new_url: string;
  created_at: string;
};

const FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "pending", label: "Chờ PTG xác nhận" },
  { id: "confirmed", label: "Chờ khách thanh toán" },
  { id: "paid", label: "Đã thanh toán" },
  { id: "payout", label: "Cần chuyển tiền PTG" },
  { id: "rejected", label: "Từ chối / Hủy" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ PTG xác nhận",
  confirmed: "Chờ khách thanh toán",
  deposit_paid: "Đang chụp",
  paid: "Đã thanh toán",
  handover: "Bàn giao ảnh",
  final_payment: "Chờ quyết toán",
  completed: "Hoàn tất",
  rejected: "Đã từ chối",
  cancelled: "Đã hủy",
};

/** Map bank_code app → BIN VietQR (img.vietqr.io) */
const BANK_BIN: Record<string, string> = {
  BIDV: "970418",
  Vietcombank: "970436",
  VCB: "970436",
  MBBank: "970422",
  MB: "970422",
  TCB: "970407",
  Techcombank: "970407",
  ACB: "970416",
  VPBank: "970432",
  TPBank: "970423",
  VietinBank: "970415",
  Agribank: "970405",
  Sacombank: "970403",
  MSB: "970426",
  OCB: "970448",
  HDBank: "970437",
  SHB: "970443",
  VIB: "970441",
};

const isPaidRow = (r: { status: string; payment_status: string | null; deposit_paid_at?: string | null }) =>
  !!r.deposit_paid_at ||
  ["deposit_paid", "paid", "handover", "final_payment", "completed"].includes(r.status) ||
  r.payment_status === "paid" ||
  r.payment_status === "deposit_paid" ||
  r.payment_status === "fully_paid";

/** Cần chuyển tiền cho PTG: chưa ứng 30%, hoặc đã hoàn tất mà chưa quyết toán 60% */
const needsPayout = (r: Booking) =>
  isPaidRow(r) &&
  r.status !== "rejected" &&
  r.status !== "cancelled" &&
  (!r.ptg_advance_paid_at || (r.status === "completed" && !r.ptg_final_paid_at));

function formatVnd(n: number) {
  return `${Number(n || 0).toLocaleString("vi-VN")}đ`;
}

function calcAdvance(total: number) {
  return Math.round(Number(total || 0) * 0.3);
}
function calcFinal(total: number) {
  // 90% tổng - 30% đã ứng = 60%
  return Math.round(Number(total || 0) * 0.9) - Math.round(Number(total || 0) * 0.3);
}
function calcPlatformFee(total: number) {
  return Math.round(Number(total || 0) * 0.1);
}

function buildPayoutDes(bookingId: string, kind: "advance" | "final") {
  const raw = bookingId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const short = (raw.slice(0, 8) || String(Date.now()).slice(-8)).toUpperCase();
  return kind === "advance" ? `MMT${short}A` : `MMT${short}F`;
}

function buildVietQrImg(opts: {
  bankCode: string | null | undefined;
  account: string;
  amount: number;
  description: string;
  accountName?: string | null;
}) {
  const bin = BANK_BIN[opts.bankCode || ""] || opts.bankCode || "970418";
  const acc = (opts.account || "").replace(/\s/g, "");
  const params = new URLSearchParams();
  params.set("amount", String(Math.round(opts.amount)));
  params.set("addInfo", opts.description.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 25));
  if (opts.accountName) params.set("accountName", opts.accountName);
  return `https://img.vietqr.io/image/${bin}-${acc}-compact2.png?${params.toString()}`;
}

export default function Bookings() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("paid");
  const [q, setQ] = useState("");
  const [banks, setBanks] = useState<Record<string, Bank>>({});
  const [payoutModal, setPayoutModal] = useState<{
    booking: Booking;
    kind: "advance" | "final";
  } | null>(null);
  const [detailModal, setDetailModal] = useState<Booking | null>(null);
  const [feedback, setFeedback] = useState<PhotoFeedback[]>([]);
  const [imgUrls, setImgUrls] = useState<Record<string, string>>({});
  const [driveHistory, setDriveHistory] = useState<DriveLinkChange[]>([]);
  const [busy, setBusy] = useState(false);

  async function markPaid(id: string) {
    if (!confirm("Xác nhận bạn đã thấy tiền của lịch hẹn này trong tài khoản admin?")) return;
    const { error } = await supabase.rpc("admin_mark_booking_paid", { p_booking_id: id, p_note: null });
    if (error) setError(error.message);
    else load();
  }

  async function confirmPayout(id: string, kind: "advance" | "final", ref?: string) {
    setBusy(true);
    const { error } = await supabase.rpc("admin_mark_ptg_payout", {
      p_booking_id: id,
      p_kind: kind,
      p_ref: ref || null,
    });
    setBusy(false);
    if (error) setError(error.message);
    else {
      setPayoutModal(null);
      load();
    }
  }

  async function openDetail(b: Booking) {
    setDetailModal(b);
    setFeedback([]);
    setImgUrls({});
    setDriveHistory([]);

    const { data } = await supabase
      .from("booking_photo_feedback")
      .select("*")
      .eq("booking_id", b.id)
      .order("created_at", { ascending: true });
    const rows = (data as PhotoFeedback[]) || [];
    setFeedback(rows);

    const paths = rows.flatMap((r) => r.images || []);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("feedback-images").createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      (signed || []).forEach((x) => {
        if (x.path && x.signedUrl) map[x.path] = x.signedUrl;
      });
      setImgUrls(map);
    }

    const { data: hist } = await supabase
      .from("booking_drive_links")
      .select("id, old_url, new_url, created_at")
      .eq("booking_id", b.id)
      .order("created_at", { ascending: false });
    setDriveHistory((hist as DriveLinkChange[]) || []);
  }

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (err) setError(err.message);
    else {
      const list = (data as Booking[]) || [];
      setRows(list);
      const ids = Array.from(new Set(list.map((r) => r.photographer_user_id).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: ph } = await supabase
          .from("photographers")
          .select("user_id, bank_name, bank_code, bank_account, bank_account_name")
          .in("user_id", ids);
        const m: Record<string, Bank> = {};
        for (const p of (ph as (Bank & { user_id: string })[]) || []) m[p.user_id] = p;
        // fallback applications nếu photographers chưa có STK
        const missing = ids.filter((id) => !m[id]?.bank_account);
        if (missing.length) {
          const { data: apps } = await supabase
            .from("photographer_applications")
            .select("user_id, bank_name, bank_code, bank_account, bank_account_name")
            .in("user_id", missing);
          for (const a of (apps as (Bank & { user_id: string })[]) || []) {
            if (!m[a.user_id]?.bank_account) m[a.user_id] = a;
          }
        }
        setBanks(m);
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, paid: 0, pending: 0, confirmed: 0, rejected: 0, payout: 0 };
    for (const r of rows) {
      if (r.status === "rejected" || r.status === "cancelled") c.rejected++;
      else if (isPaidRow(r)) {
        c.paid++;
        if (needsPayout(r)) c.payout++;
      } else if (r.status === "pending") c.pending++;
      else if (r.status === "confirmed") c.confirmed++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === "paid") list = list.filter((r) => isPaidRow(r) && r.status !== "rejected" && r.status !== "cancelled");
    else if (filter === "payout") list = list.filter(needsPayout);
    else if (filter === "rejected") list = list.filter((r) => r.status === "rejected" || r.status === "cancelled");
    else if (filter !== "all") list = list.filter((r) => r.status === filter && !isPaidRow(r));
    const s = q.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (r) =>
          (r.payment_ref || "").toLowerCase().includes(s) ||
          (r.client_name || "").toLowerCase().includes(s) ||
          (r.photographer_name || "").toLowerCase().includes(s) ||
          (r.package_name || "").toLowerCase().includes(s) ||
          r.id.toLowerCase().includes(s)
      );
    }
    return list;
  }, [rows, filter, q]);

  return (
    <>
      <div className="topbar">
        <h2>Đơn &amp; thanh toán (VietQR)</h2>
        <button className="btn btn-ghost" onClick={load}>
          Làm mới
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
        <strong>Luồng tiền (escrow):</strong>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          <li>
            Khách CK <strong>100%</strong> deal vào <em>TK admin</em> (nội dung <code>MMT-XXXXXXXX</code>) → webhook
            tự đánh dấu đã nhận.
          </li>
          <li>
            Admin chuyển tay <strong>30%</strong> cho PTG ngay sau khi nhận (nút «Ứng 30%» → hiện QR).
          </li>
          <li>
            Khi 2 bên xong deal (status <code>completed</code>), admin chuyển <strong>60%</strong> còn lại cho PTG
            (nút «Quyết toán» → QR). Platform giữ <strong>10%</strong> phí.
          </li>
        </ul>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="n">{counts.paid}</div>
          <div className="l">Đã thanh toán</div>
        </div>
        <div className="stat">
          <div className="n">{counts.payout}</div>
          <div className="l">Cần chuyển tiền PTG</div>
        </div>
        <div className="stat">
          <div className="n">{counts.confirmed}</div>
          <div className="l">Chờ khách thanh toán</div>
        </div>
      </div>

      <div className="tabs">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? "active" : ""}
            onClick={() => setFilter(f.id)}
          >
            {f.label} ({counts[f.id] ?? 0})
          </button>
        ))}
      </div>

      <input
        className="search"
        placeholder="Tìm mã bill MMT-…, tên khách, PTG, gói…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {error && (
        <div className="card" style={{ color: "#b91c1c", marginTop: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : filtered.length === 0 ? (
        <div className="card">Không có đơn.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Khách / PTG</th>
                <th>Trạng thái</th>
                <th>Số tiền</th>
                <th>STK PTG</th>
                <th>Gói / lịch</th>
                <th>Thanh toán</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const paid = isPaidRow(r);
                const bank = r.photographer_user_id ? banks[r.photographer_user_id] : undefined;
                const advance = calcAdvance(r.package_price);
                const finalAmt = calcFinal(r.package_price);
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.client_name || "—"}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        PTG: {r.photographer_name}
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 11, padding: "2px 6px", marginTop: 4 }}
                        onClick={() => openDetail(r)}
                      >
                        Chi tiết deal
                      </button>
                    </td>
                    <td>
                      <span className="badge">{STATUS_LABEL[r.status] || r.status}</span>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div>
                        <strong>{formatVnd(r.package_price)}</strong>
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        Ứng 30%: {formatVnd(advance)}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        Quyết toán 60%: {formatVnd(finalAmt)}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        Phí 10%: {formatVnd(calcPlatformFee(r.package_price))}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 160 }}>
                      {bank?.bank_account ? (
                        <div>
                          <div>
                            {bank.bank_name || bank.bank_code}
                          </div>
                          <div className="muted">
                            {bank.bank_account}
                            <br />
                            {bank.bank_account_name}
                          </div>
                        </div>
                      ) : paid ? (
                        <div style={{ color: "#b91c1c" }}>Chưa có STK</div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ maxWidth: 180 }}>
                      <div style={{ fontSize: 12 }}>{r.package_name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {r.booking_date} · {r.start_time}–{r.end_time}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {r.paid_at || r.deposit_paid_at
                        ? new Date(r.paid_at || r.deposit_paid_at!).toLocaleString("vi-VN")
                        : "—"}
                      {r.payment_ref && (
                        <div className="muted" style={{ fontSize: 11 }}>
                          ref: {r.payment_ref}
                        </div>
                      )}
                    </td>
                    <td style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {!paid && r.status === "confirmed" && (
                        <button
                          type="button"
                          className="btn btn-ok"
                          style={{ fontSize: 11, padding: "6px 10px" }}
                          onClick={() => markPaid(r.id)}
                        >
                          Đánh dấu đã nhận tiền
                        </button>
                      )}
                      {paid && !r.ptg_advance_paid_at && (
                        <button
                          type="button"
                          className="btn btn-ok"
                          style={{ fontSize: 11, padding: "6px 10px" }}
                          onClick={() => setPayoutModal({ booking: r, kind: "advance" })}
                        >
                          Ứng 30% ({formatVnd(advance)}) → QR
                        </button>
                      )}
                      {paid && r.ptg_advance_paid_at && (
                        <span className="muted" style={{ fontSize: 11 }}>
                          ✓ Đã ứng 30%
                          {r.ptg_advance_paid_at && (
                            <> · {new Date(r.ptg_advance_paid_at).toLocaleDateString("vi-VN")}</>
                          )}
                        </span>
                      )}
                      {r.status === "completed" && !r.ptg_final_paid_at && (
                        <button
                          type="button"
                          className="btn btn-ok"
                          style={{ fontSize: 11, padding: "6px 10px" }}
                          onClick={() => setPayoutModal({ booking: r, kind: "final" })}
                        >
                          Quyết toán 60% ({formatVnd(finalAmt)}) → QR
                        </button>
                      )}
                      {r.ptg_final_paid_at && (
                        <span className="muted" style={{ fontSize: 11 }}>
                          ✓ Đã quyết toán
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal QR chuyển tiền PTG */}
      {payoutModal && (() => {
        const b = payoutModal.booking;
        const kind = payoutModal.kind;
        const bank = b.photographer_user_id ? banks[b.photographer_user_id] : undefined;
        const amount = kind === "advance" ? calcAdvance(b.package_price) : calcFinal(b.package_price);
        const des = buildPayoutDes(b.id, kind);
        const hasBank = !!(bank?.bank_account);
        const qrUrl = hasBank
          ? buildVietQrImg({
              bankCode: bank!.bank_code,
              account: bank!.bank_account!,
              amount,
              description: des,
              accountName: bank!.bank_account_name,
            })
          : null;
        return (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
            onClick={() => setPayoutModal(null)}
          >
            <div
              className="card"
              style={{ maxWidth: 420, width: "100%", maxHeight: "90vh", overflow: "auto" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>
                  {kind === "advance" ? "Ứng 30% cho PTG" : "Quyết toán 60% cho PTG"}
                </h3>
                <button className="btn btn-ghost" type="button" onClick={() => setPayoutModal(null)}>
                  ✕
                </button>
              </div>
              <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6 }}>
                <div>
                  <span className="muted">PTG:</span> <strong>{b.photographer_name}</strong>
                </div>
                <div>
                  <span className="muted">Khách:</span> {b.client_name || "—"}
                </div>
                <div>
                  <span className="muted">Gói:</span> {b.package_name} · {formatVnd(b.package_price)}
                </div>
                <div>
                  <span className="muted">Số tiền CK:</span>{" "}
                  <strong style={{ color: "#059669", fontSize: 16 }}>{formatVnd(amount)}</strong>
                </div>
                <div>
                  <span className="muted">Nội dung CK:</span> <code>{des}</code>
                </div>
                {hasBank ? (
                  <>
                    <div style={{ marginTop: 8 }}>
                      <span className="muted">Nhận:</span> {bank!.bank_name || bank!.bank_code} ·{" "}
                      <strong>{bank!.bank_account}</strong>
                      <br />
                      <span className="muted">Chủ TK:</span> {bank!.bank_account_name}
                    </div>
                    {qrUrl && (
                      <div style={{ textAlign: "center", marginTop: 12 }}>
                        <img
                          src={qrUrl}
                          alt="VietQR"
                          style={{ width: 240, height: 240, objectFit: "contain", borderRadius: 8 }}
                        />
                        <p className="muted" style={{ fontSize: 12 }}>
                          Quét QR bằng app ngân hàng → chuyển đúng số tiền &amp; nội dung
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: "#b91c1c", marginTop: 8 }}>
                    PTG chưa có STK trên hệ thống. Yêu cầu PTG cập nhật trong Cài đặt rồi admin duyệt.
                  </div>
                )}
              </div>
              <div className="actions" style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" type="button" onClick={() => setPayoutModal(null)}>
                  Đóng
                </button>
                <button
                  className="btn btn-ok"
                  type="button"
                  disabled={busy || !hasBank}
                  onClick={() => {
                    const ref = prompt("Mã GD ngân hàng sau khi đã CK (có thể bỏ trống):") ?? "";
                    confirmPayout(b.id, kind, ref || des);
                  }}
                >
                  {busy ? "Đang lưu…" : "Tôi đã chuyển — đánh dấu xong"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal chi tiết deal */}
      {detailModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setDetailModal(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 520, width: "100%", maxHeight: "90vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Chi tiết deal</h3>
              <button className="btn btn-ghost" type="button" onClick={() => setDetailModal(null)}>
                ✕
              </button>
            </div>
            <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7 }}>
              <div>
                <span className="muted">Mã đơn:</span> <code>{detailModal.id}</code>
              </div>
              <div>
                <span className="muted">Trạng thái:</span>{" "}
                {STATUS_LABEL[detailModal.status] || detailModal.status}
              </div>
              <div>
                <span className="muted">Khách:</span> {detailModal.client_name || "—"}
              </div>
              <div>
                <span className="muted">PTG:</span> {detailModal.photographer_name}
              </div>
              <div>
                <span className="muted">Gói:</span> {detailModal.package_name} ·{" "}
                {formatVnd(detailModal.package_price)}
              </div>
              <div>
                <span className="muted">Lịch:</span> {detailModal.booking_date} · {detailModal.start_time}–
                {detailModal.end_time}
              </div>
              {detailModal.client_note && (
                <div>
                  <span className="muted">Ghi chú khách:</span> {detailModal.client_note}
                </div>
              )}
              {detailModal.ptg_note && (
                <div>
                  <span className="muted">Ghi chú PTG:</span> {detailModal.ptg_note}
                </div>
              )}
              {detailModal.handover_note && (
                <div>
                  <span className="muted">Ghi chú bàn giao:</span> {detailModal.handover_note}
                </div>
              )}
              {detailModal.drive_url && (
                <div>
                  <span className="muted">Link ảnh / Drive:</span>{" "}
                  <a href={detailModal.drive_url} target="_blank" rel="noreferrer">
                    {detailModal.drive_url}
                  </a>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <span className="muted">Mốc thời gian:</span>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {detailModal.deposit_paid_at && (
                    <li>Nhận tiền: {new Date(detailModal.deposit_paid_at).toLocaleString("vi-VN")}</li>
                  )}
                  {detailModal.shoot_done_at && (
                    <li>Xong chụp: {new Date(detailModal.shoot_done_at).toLocaleString("vi-VN")}</li>
                  )}
                  {detailModal.drive_submitted_at && (
                    <li>Gửi ảnh: {new Date(detailModal.drive_submitted_at).toLocaleString("vi-VN")}</li>
                  )}
                  {detailModal.client_approved_at && (
                    <li>Khách duyệt: {new Date(detailModal.client_approved_at).toLocaleString("vi-VN")}</li>
                  )}
                  {detailModal.ptg_advance_paid_at && (
                    <li>Đã ứng 30%: {new Date(detailModal.ptg_advance_paid_at).toLocaleString("vi-VN")}</li>
                  )}
                  {detailModal.ptg_final_paid_at && (
                    <li>Đã quyết toán: {new Date(detailModal.ptg_final_paid_at).toLocaleString("vi-VN")}</li>
                  )}
                </ul>
              </div>
              {feedback.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <strong>Yêu cầu chỉnh sửa ({feedback.length} vòng)</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {feedback.map((f, i) => (
                      <li key={f.id} style={{ marginBottom: 6 }}>
                        <strong>#{f.round ?? i + 1}</strong>{" "}
                        <span className="muted">[{f.photo_label}]</span> {f.note}
                        {f.resolved ? " ✓ đã chỉnh" : " · chờ chỉnh"}
                        {(f.images || []).length > 0 && (
                          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            {(f.images || []).map((path) =>
                              imgUrls[path] ? (
                                <a key={path} href={imgUrls[path]} target="_blank" rel="noreferrer">
                                  <img
                                    src={imgUrls[path]}
                                    alt="Ảnh đính kèm"
                                    style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }}
                                  />
                                </a>
                              ) : null
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {driveHistory.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <strong>Lịch sử đổi link Drive ({driveHistory.length})</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {driveHistory.map((h) => (
                      <li key={h.id} style={{ marginBottom: 6, wordBreak: "break-all" }}>
                        <span className="muted">{new Date(h.created_at).toLocaleString("vi-VN")}</span>
                        <div>
                          Mới: <a href={h.new_url} target="_blank" rel="noreferrer">{h.new_url}</a>
                        </div>
                        {h.old_url && (
                          <div className="muted">
                            Cũ: <a href={h.old_url} target="_blank" rel="noreferrer">{h.old_url}</a>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ marginTop: 12, padding: 10, background: "#f8fafc", borderRadius: 8 }}>
                <strong>Hóa đơn tóm tắt</strong>
                <div>Tổng deal: {formatVnd(detailModal.package_price)}</div>
                <div>Ứng PTG 30%: {formatVnd(calcAdvance(detailModal.package_price))}</div>
                <div>Quyết toán 60%: {formatVnd(calcFinal(detailModal.package_price))}</div>
                <div>Phí platform 10%: {formatVnd(calcPlatformFee(detailModal.package_price))}</div>
                <div>PTG nhận tổng 90%: {formatVnd(Math.round(detailModal.package_price * 0.9))}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
