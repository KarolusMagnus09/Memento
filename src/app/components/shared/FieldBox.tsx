import type { ReactNode } from "react";

export function FieldBox({
  label, error, hint, children,
}: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-2 mt-1.5 px-4 py-3.5 rounded-2xl border-2 bg-white"
        style={{ borderColor: error ? "#ef4444" : "#e5e7eb" }}>
        {children}
      </div>
      {error ? (
        <p className="text-xs text-red-600 mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
}
