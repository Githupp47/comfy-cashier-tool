import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

const escapeCsv = (val: any): string => {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export function generateStockCsv(products: Product[]): string {
  const headers = [
    "ชื่อสินค้า",
    "ราคา (บาท)",
    "รายละเอียด",
    "จำนวนสินค้าคงเหลือ",
    "ประเภทสินค้า",
    "สายพันธุ์ข้าว",
    "น้ำหนัก",
    "สถานะ",
  ];
  const categoryLabel = (c: string) =>
    c === "ice_cream" ? "ไอติมข้าว" : c === "koji" ? "เชื้อโคจิ" : c;
  const rows = products.map((p) =>
    [
      escapeCsv(p.name),
      escapeCsv(p.price),
      escapeCsv(p.description ?? ""),
      escapeCsv((p as any).stock_quantity ?? 0),
      escapeCsv(categoryLabel(p.category ?? "")),
      escapeCsv(p.rice_variety ?? ""),
      escapeCsv(p.weight ?? ""),
      escapeCsv(p.is_available ? "พร้อมขาย" : "ปิดขาย"),
    ].join(",")
  );
  return "\uFEFF" + [headers.join(","), ...rows].join("\n");
}

export function downloadStockCsv(products: Product[], filename?: string) {
  const csv = generateStockCsv(products);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = filename || `hakko-stock-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
