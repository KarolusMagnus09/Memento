import { Search, X } from "lucide-react";
import type { Screen, Photographer } from "../types";
import { TEAL, BG, styles } from "../constants";
import { useState } from "react";
import { getCardTags } from "../lib/photographerDisplay";
import { StyleFilter } from "../components/shared/StyleFilter";
import { matchesStyle } from "../lib/styleFilter";
import { PhotographerCard } from "../components/shared/PhotographerCard";

export default function SearchScreen({ setScreen, setPhotographer, savedIds, toggleSave, photographers }:
  { setScreen: (s: Screen) => void; setPhotographer: (p: Photographer) => void; savedIds: number[]; toggleSave: (id: number) => void; photographers: Photographer[] }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const activeGroup = styles.find(s => s.label === activeCategory) ?? null;
  const q = query.trim().toLowerCase();
  const results = photographers.filter(p =>
    (!q || p.name.toLowerCase().includes(q) || p.specialty.toLowerCase().includes(q) ||
      getCardTags(p, 10).some(t => t.toLowerCase().includes(q))) &&
    matchesStyle(p, activeGroup, activeSubcategory)
  );

  return (
    <div className="flex flex-col min-h-screen pb-24" style={{ background: BG }}>
      <div className="px-5 py-3 relative" style={{ background: TEAL }}>
        <h2 className="font-bold text-base mb-2 text-white">Khám phá</h2>
        <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-2.5 shadow-md">
          <Search size={16} className="text-muted-foreground" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-foreground" placeholder="Tìm kiếm nhiếp ảnh gia, studio..." />
          {query && <button onClick={() => setQuery("")}><X size={14} className="text-muted-foreground" /></button>}
        </div>
      </div>

      <div className="px-4 mt-4">
        <h3 className="font-bold text-foreground mb-3">Phong cách</h3>
        <div className="mb-4">
          <StyleFilter category={activeCategory} subcategory={activeSubcategory}
            onChange={(c, sub) => { setActiveCategory(c); setActiveSubcategory(sub); }} />
        </div>

        <div className="flex flex-col gap-4">
          {results.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">Không tìm thấy nhiếp ảnh gia phù hợp.</p>
          )}
          {results.map(p => (
            <PhotographerCard key={p.id} p={p}
              saved={savedIds.includes(p.id)}
              onToggleSave={() => toggleSave(p.id)}
              onProfile={() => { setPhotographer(p); setScreen("photographer-profile"); }}
              onBook={() => { setPhotographer(p); setScreen("booking"); }} />
          ))}
        </div>
      </div>
    </div>
  );
}
