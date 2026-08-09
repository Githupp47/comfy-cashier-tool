import { useState } from "react";
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
import { Plus, Minus, PlusCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Line = { id: string; name: string; price: number; qty: number };

export function ManualSaleDialog({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [customerName, setCustomerName] = useState("ขายหน้าร้าน");
  const [customerPhone, setCustomerPhone] = useState("-");
  const [note, setNote] = useState("");
  const [shipping, setShipping] = useState("0");
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
  const total = subtotal + (Number(shipping) || 0);

  const reset = () => {
    setLines([]);
    setCustomerName("ขายหน้าร้าน");
    setCustomerPhone("-");
    setNote("");
    setShipping("0");
  };

  const save = async () => {
    if (lines.length === 0) return toast.error("เลือกสินค้าก่อนนะคะ");
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
        shipping_fee: Number(shipping) || 0,
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
              <Label className="text-xs">เบอร์โทร</Label>
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ค่าส่ง (บาท)</Label>
              <Input type="number" min={0} value={shipping} onChange={(e) => setShipping(e.target.value)} className="rounded-lg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ยอดรวม</Label>
              <div className="h-10 flex items-center px-3 rounded-lg bg-muted font-bold text-primary">
                ฿{total.toLocaleString()}
              </div>
            </div>
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
