import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Minus, PlusCircle, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import { customerKey, pickBestPromo, promoLabel, type Promotion } from "@/lib/promotions";

type Line = { id: string; name: string; price: number; qty: number };

export function ManualSaleDialog({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [customerName, setCustomerName] = useState("ขายหน้าร้าน");
  const [customerPhone, setCustomerPhone] = useState("-");
  const [note, setNote] = useState("");
  const [shipping, setShipping] = useState("0");
  const [promoCode, setPromoCode] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["manual-sale-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock_quantity")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: promotions } = useQuery({
    queryKey: ["manual-sale-promos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as Promotion[];
    },
    enabled: open,
  });

  const custKey = customerKey(customerPhone);

  const { data: redemptions } = useQuery({
    queryKey: ["manual-sale-redemptions", custKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promotion_redemptions")
        .select("promotion_id")
        .eq("customer_key", custKey);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && custKey.length >= 9,
  });

  const add = (p: { id: string; name: string; price: number }) => {
    setLines((prev) => {
      const found = prev.find((l) => l.id === p.id);
      if (found) return prev.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { id: p.id, name: p.name, price: Number(p.price), qty: 1 }];
    });
  };

  const setQty = (id: string, delta: number) =>
    setLines((prev) =>
      prev
        .map((l) => (l.id === id ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);

  const eligible = useMemo(() => {
    const used = new Map<string, number>();
    for (const r of redemptions ?? []) {
      used.set(r.promotion_id, (used.get(r.promotion_id) ?? 0) + 1);
    }
    return (promotions ?? []).filter((p) => {
      if (p.is_test) return false;
      const lim = p.per_customer_limit;
      if (lim == null) return true;
      return (used.get(p.id) ?? 0) < lim;
    });
  }, [promotions, redemptions]);

  const { promo, discount, freeShipping } = useMemo(
    () => pickBestPromo(eligible, subtotal, promoCode),
    [eligible, subtotal, promoCode]
  );

  const codeTyped = promoCode.trim().length > 0;
  const codeInvalid =
    codeTyped &&
    !promo &&
    subtotal > 0 &&
    !(promotions ?? []).some(
      (p) => (p.code ?? "").trim().toLowerCase() === promoCode.trim().toLowerCase()
    );
  const codeUsedUp =
    codeTyped &&
    !promo &&
    (promotions ?? []).some(
      (p) =>
        (p.code ?? "").trim().toLowerCase() === promoCode.trim().toLowerCase() &&
        !eligible.some((e) => e.id === p.id)
    );

  const shippingFee = freeShipping ? 0 : Number(shipping) || 0;
  const total = Math.max(0, subtotal - discount) + shippingFee;

  const reset = () => {
    setLines([]);
    setCustomerName("ขายหน้าร้าน");
    setCustomerPhone("-");
    setNote("");
    setShipping("0");
    setPromoCode("");
  };

  const save = async () => {
    if (lines.length === 0) return toast.error("เลือกสินค้าก่อนนะคะ");
    if (codeUsedUp) return toast.error("โค้ดนี้เบอร์นี้ใช้สิทธิ์ครบแล้วค่ะ");
    setSaving(true);
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        customer_name: customerName.trim() || "ขายหน้าร้าน",
        customer_phone: customerPhone.trim() || "-",
        note: note.trim() ? `[ขายนอกเว็บ] ${note.trim()}` : "[ขายนอกเว็บ]",
        status: "completed",
        slip_status: "approved",
        slip_verified_at: new Date().toISOString(),
        shipping_fee: shippingFee,
        discount_amount: discount,
        promotion_code: promo ? (promo.code ?? promo.name) : null,
        total_amount: total,
      })
      .select("id")
      .single();

    if (error || !order) {
      setSaving(false);
      return toast.error(error?.message ?? "บันทึกไม่สำเร็จ");
    }

    const { error: itemErr } = await supabase.from("order_items").insert(
      lines.map((l) => ({
        order_id: order.id,
        product_id: l.id,
        product_name: l.name,
        quantity: l.qty,
        price: l.price,
      }))
    );

    if (promo) {
      await supabase.from("promotion_redemptions").insert({
        promotion_id: promo.id,
        code: promo.code,
        customer_key: custKey || (customerName.trim() || "walk-in").toLowerCase(),
        customer_name: customerName.trim() || null,
        order_id: order.id,
        channel: "manual",
      });
      await supabase
        .from("promotions")
        .update({ used_count: Number(promo.used_count || 0) + 1 })
        .eq("id", promo.id);
    }

    setSaving(false);
    if (itemErr) return toast.error(itemErr.message);

    toast.success(`บันทึกยอดขาย ฿${total.toLocaleString()} แล้ว (ตัดสต็อกอัตโนมัติ)`);
    reset();
    setOpen(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl gap-2">
          <PlusCircle className="h-4 w-4" /> เพิ่มยอดขาย
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>เพิ่มยอดขาย (ขายนอกเว็บ)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">เลือกสินค้า</Label>
            <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto">
              {(products ?? []).map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => add(p)}
                  className="text-left p-2 rounded-xl border border-border hover:border-primary hover:bg-muted/40 transition-colors"
                >
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    ฿{Number(p.price).toLocaleString()} · เหลือ {p.stock_quantity}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {lines.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              {lines.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <p className="flex-1 text-sm truncate">{l.name}</p>
                  <Button size="icon" variant="outline" className="h-7 w-7 rounded-lg" onClick={() => setQty(l.id, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-medium">{l.qty}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7 rounded-lg" onClick={() => setQty(l.id, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Badge variant="secondary">฿{(l.price * l.qty).toLocaleString()}</Badge>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">ชื่อลูกค้า</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">เบอร์โทร (ใช้นับสิทธิ์โค้ด)</Label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="rounded-lg" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">โค้ดส่วนลด (ถ้ามี)</Label>
              <Input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="เช่น HAKKO50"
                className="rounded-lg uppercase"
              />
              {promo && (
                <p className="text-xs text-primary flex items-center gap-1">
                  <Tag className="h-3 w-3" /> {promo.name} — {promoLabel(promo)}
                </p>
              )}
              {codeUsedUp && (
                <p className="text-xs text-destructive">โค้ดนี้เบอร์นี้ใช้สิทธิ์ครบแล้วค่ะ</p>
              )}
              {codeInvalid && !codeUsedUp && (
                <p className="text-xs text-muted-foreground">ยังใช้โค้ดนี้ไม่ได้ (ไม่มีโค้ด/ยอดไม่ถึงขั้นต่ำ)</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ค่าส่ง (บาท)</Label>
              <Input type="number" min={0} value={shipping} onChange={(e) => setShipping(e.target.value)} className="rounded-lg" disabled={freeShipping} />
              {freeShipping && <p className="text-[11px] text-primary">โปรฯ นี้ส่งฟรี</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ยอดรวม</Label>
              <div className="h-10 flex items-center px-3 rounded-lg bg-muted font-bold text-primary">
                ฿{total.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">ค่าสินค้า</span><span>฿{subtotal.toLocaleString()}</span></div>
            {discount > 0 && (
              <div className="flex justify-between text-primary"><span>ส่วนลด</span><span>-฿{discount.toLocaleString()}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">ค่าส่ง</span><span>฿{shippingFee.toLocaleString()}</span></div>
            <div className="flex justify-between font-bold border-t border-border pt-1"><span>ยอดรวม</span><span>฿{total.toLocaleString()}</span></div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">หมายเหตุ (เช่น ขายที่ตลาด / ไลน์ส่วนตัว)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rounded-lg" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button className="rounded-xl gap-2" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} บันทึกยอดขาย
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
