// import { useState, useEffect } from "react";
// import { supabase } from "../lib/supabase";
// import type { Photographer } from "../types";

// // Chuẩn hoá dữ liệu thô từ Supabase: đảm bảo boards/standalone_pins/pin_likes
// // luôn là giá trị hợp lệ (mảng/đối tượng), kể cả khi migration 010 chưa chạy
// // (cột chưa tồn tại → null) hoặc dữ liệu cũ chưa có các trường này. Nếu chưa
// // có ảnh nào được đăng theo kiểu board/pin, tạm dùng `portfolio` cũ làm ảnh
// // đăng lẻ để không bị trống trơn.
// function normalizePhotographer(row: any): Photographer {
//   const portfolio = Array.isArray(row.portfolio) ? row.portfolio : [];
//   const standalone_pins = Array.isArray(row.standalone_pins) ? row.standalone_pins : [];
//   return {
//     ...row,
//     portfolio,
//     boards: Array.isArray(row.boards) ? row.boards : [],
//     standalone_pins: standalone_pins.length > 0 ? standalone_pins : portfolio,
//     pin_likes: row.pin_likes && typeof row.pin_likes === "object" ? row.pin_likes : {},
//   } as Photographer;
// }

// export function usePhotographers() {
//   const [photographers, setPhotographers] = useState<Photographer[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   useEffect(() => {
//     let cancelled = false;
//     async function load() {
//       const { data, error } = await supabase
//         .from("photographers")
//         .select("*")
//         .order("id", { ascending: true });
//       if (cancelled) return;
//       if (error) {
//         setError(error.message);
//       } else {
//         setPhotographers((data ?? []).map(normalizePhotographer));
//       }
//       setLoading(false);
//     }
//     load();
//     return () => { cancelled = true; };
//   }, []);

//   return { photographers, loading, error };
// }

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { Photographer } from "../types";

// Chuẩn hoá dữ liệu thô từ Supabase: đảm bảo boards/standalone_pins/pin_likes
// luôn là giá trị hợp lệ (mảng/đối tượng), kể cả khi migration 010 chưa chạy
// (cột chưa tồn tại → null) hoặc dữ liệu cũ chưa có các trường này. Nếu chưa
// có ảnh nào được đăng theo kiểu board/pin, tạm dùng `portfolio` cũ làm ảnh
// đăng lẻ để không bị trống trơn.
function normalizePhotographer(row: any): Photographer {
  const portfolio = Array.isArray(row.portfolio) ? row.portfolio : [];
  const standalone_pins = Array.isArray(row.standalone_pins) ? row.standalone_pins : [];
  return {
    ...row,
    portfolio,
    boards: Array.isArray(row.boards) ? row.boards : [],
    standalone_pins: standalone_pins.length > 0 ? standalone_pins : portfolio,
    pin_likes: row.pin_likes && typeof row.pin_likes === "object" ? row.pin_likes : {},
    // Chi tiết hồ sơ (kinh nghiệm/thiết bị/ngôn ngữ/mô hình làm việc/địa
    // điểm/phong cách) — cột có thể chưa tồn tại ở DB cũ, ép về mảng/null
    // hợp lệ để PhotographerProfileScreen không crash.
    languages: Array.isArray(row.languages) ? row.languages : null,
    work_locations: Array.isArray(row.work_locations) ? row.work_locations : null,
    shooting_styles: Array.isArray(row.shooting_styles) ? row.shooting_styles : null,
  } as Photographer;
}

export function usePhotographers() {
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from("photographers")
        .select("*")
        .order("id", { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        setPhotographers((data ?? []).map(normalizePhotographer));
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { photographers, loading, error };
}
