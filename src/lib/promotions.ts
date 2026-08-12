export type Promotion = {
  id: string;
  name: string;
  code: string | null;
  discount_type: string; // 'percent' | 'fixed'
  discount_value: number;
  min_order_amount: number;
  max_discount: number | null;
  free_shipping: boolean;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  used_count: number;
  description: string | null;
  sort_order: number;
};

export function isPromoUsable(p: Promotion, subTotal: number, now = new Date()): boolean {
  if (!p.is_active) return false;
  if (p.starts_at && new Date(p.starts_at) > now) return false;
  if (p.ends_at && new Date(p.ends_at) < now) return false;
  if (p.usage_limit != null && p.used_count >= p.usage_limit) return false;
  if (subTotal < Number(p.min_order_amount || 0)) return false;
  return true;
}

export function promoDiscount(p: Promotion, subTotal: number): number {
  let d = 0;
  if (p.discount_type === "percent") {
    d = (subTotal * Number(p.discount_value || 0)) / 100;
    if (p.max_discount != null && Number(p.max_discount) > 0) d = Math.min(d, Number(p.max_discount));
  } else {
    d = Number(p.discount_value || 0);
  }
  return Math.max(0, Math.min(Math.round(d * 100) / 100, subTotal));
}

/** เลือกโปรที่ดีที่สุด: โปรอัตโนมัติ (ไม่มีโค้ด) + โค้ดที่ลูกค้ากรอก */
export function pickBestPromo(
  promos: Promotion[],
  subTotal: number,
  code?: string,
  now = new Date()
): { promo: Promotion | null; discount: number; freeShipping: boolean } {
  const typed = (code || "").trim().toLowerCase();
  const candidates = promos.filter((p) => {
    if (!isPromoUsable(p, subTotal, now)) return false;
    if (p.code) return typed !== "" && p.code.trim().toLowerCase() === typed;
    return true;
  });
  let best: Promotion | null = null;
  let bestValue = -1;
  for (const p of candidates) {
    const v = promoDiscount(p, subTotal) + (p.free_shipping ? 0.01 : 0);
    if (v > bestValue) { bestValue = v; best = p; }
  }
  if (!best) return { promo: null, discount: 0, freeShipping: false };
  return { promo: best, discount: promoDiscount(best, subTotal), freeShipping: !!best.free_shipping };
}

export function promoLabel(p: Promotion): string {
  const base = p.discount_type === "percent"
    ? `ลด ${Number(p.discount_value)}%`
    : `ลด ฿${Number(p.discount_value).toLocaleString()}`;
  const extra = [
    p.max_discount ? `สูงสุด ฿${Number(p.max_discount).toLocaleString()}` : "",
    p.min_order_amount ? `ขั้นต่ำ ฿${Number(p.min_order_amount).toLocaleString()}` : "",
    p.free_shipping ? "ส่งฟรี" : "",
  ].filter(Boolean).join(" · ");
  return extra ? `${base} (${extra})` : base;
}
