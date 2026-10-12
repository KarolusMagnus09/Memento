export function Badge({ text, color = "teal" }: { text: string; color?: string }) {
  const cls = color === "teal" ? "bg-teal-100 text-teal-800" : color === "green" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{text}</span>;
}


