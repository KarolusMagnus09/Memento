// Ảnh bìa bộ sưu tập kiểu "đa lớp" (collage):
// - 1 ảnh  → phủ kín cả ô
// - 2 ảnh  → chia đôi trái/phải
// - 3+ ảnh → 1 ô lớn bên trái + 2 ô nhỏ xếp chồng bên phải (chỉ lấy 3 ảnh đầu để ghép bìa)
// Component chỉ lo phần ảnh bên trong; nơi gọi tự bọc khung aspect-square/rounded-xl/overflow-hidden.
export function BoardCoverCollage({ pins, alt = "" }: { pins: string[]; alt?: string }) {
  const shown = pins.slice(0, 3);

  if (shown.length === 0) {
    return <div className="w-full h-full bg-muted" />;
  }

  if (shown.length === 1) {
    return <img src={shown[0]} alt={alt} className="w-full h-full object-cover" />;
  }

  if (shown.length === 2) {
    return (
      <div className="w-full h-full grid grid-cols-2 gap-0.5">
        <img src={shown[0]} alt={alt} className="w-full h-full object-cover" />
        <img src={shown[1]} alt={alt} className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-0.5">
      <img src={shown[0]} alt={alt} className="w-full h-full object-cover row-span-2" />
      <img src={shown[1]} alt={alt} className="w-full h-full object-cover" />
      <img src={shown[2]} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
}
