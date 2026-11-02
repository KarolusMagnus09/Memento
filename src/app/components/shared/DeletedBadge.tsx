/** Nhãn "● Đã xóa" (chấm đỏ + chữ) gắn cạnh tên người dùng đã xóa tài khoản */
export function DeletedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 flex-shrink-0 text-[10px] font-bold leading-none px-1.5 py-1 rounded-full whitespace-nowrap ${className}`}
      style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#ef4444" }} aria-hidden />
      Đã xóa
    </span>
  );
}
