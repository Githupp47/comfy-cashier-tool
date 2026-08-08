import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Save, Copy } from "lucide-react";
import { toast } from "sonner";

const COURIERS: { value: string; label: string; url?: (t: string) => string }[] = [
  { value: "self", label: "🛵 ส่งเอง / ไรเดอร์ร้าน" },
  { value: "flash", label: "⚡ Flash Express", url: (t) => `https://www.flashexpress.com/fle/tracking?se=${t}` },
  { value: "kerry", label: "📦 Kerry Express", url: (t) => `https://th.kerryexpress.com/th/track/?track=${t}` },
  { value: "jt", label: "🚚 J&T Express", url: (t) => `https://www.jtexpress.co.th/index/query/gzquery.html?bills=${t}` },
  { value: "thaipost", label: "📮 ไปรษณีย์ไทย", url: (t) => `https://track.thailandpost.co.th/?trackNumber=${t}` },
  { value: "grab", label: "🟢 Grab / Lineman" },
];

export function ShippingPanel({ order, queryClient }: { order: any; queryClient: any }) {
  const [courier, setCourier] = useState<string>(order.courier || "self");
  const [tracking, setTracking] = useState<string>(order.tracking_number || "");
  const [fee, setFee] = useState<string>(String(order.shipping_fee ?? 0));
  const [saving, setSaving] = useState(false);
  const [savingFee, setSavingFee] = useState(false);

  // หา session แชทของออเดอร์นี้ (เว็บหรือไลน์) เพื่อส่งข้อความให้ถูกช่อง
  const findSession = async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("session_id, platform, line_user_id")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  };

  const saveFee = async () => {
    const f = Math.max(0, Number(fee) || 0);
    const itemsTotal = Math.max(0, Number(order.total_amount || 0) - Number(order.shipping_fee || 0));
    setSavingFee(true);
    const { error } = await supabase
      .from("orders")
      .update({ shipping_fee: f, total_amount: itemsTotal + f } as any)
      .eq("id", order.id);
    setSavingFee(false);
    if (error) return toast.error(error.message);

    const s = await findSession();
    await supabase.from("chat_messages").insert({
      order_id: order.id,
      sender_type: "admin",
      message: `🚚 ค่าจัดส่งออเดอร์ #${String(order.id).slice(0, 8)} = ฿${f.toLocaleString()}\nยอดรวมที่ต้องโอน: ฿${(itemsTotal + f).toLocaleString()}`,
      ...(s ? { session_id: s.session_id, platform: s.platform, line_user_id: s.line_user_id } : {}),
    } as any);
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    toast.success("บันทึกค่าส่ง & แจ้งลูกค้าแล้ว");
  };

  const save = async () => {
    setSaving(true);
    const preset = COURIERS.find((c) => c.value === courier);
    const url = preset?.url && tracking.trim() ? preset.url(tracking.trim()) : null;
    const { error } = await supabase
      .from("orders")
      .update({ courier, tracking_number: tracking.trim() || null, tracking_url: url } as any)
      .eq("id", order.id);
    setSaving(false);
    if (error) return toast.error(error.message);

    if (tracking.trim()) {
      const s = await findSession();
      await supabase.from("chat_messages").insert({
        order_id: order.id,
        sender_type: "admin",
        message: `📦 เลขพัสดุของคุณ: ${tracking.trim()} (${preset?.label ?? courier})${url ? `\nติดตามที่: ${url}` : ""}`,
        ...(s ? { session_id: s.session_id, platform: s.platform, line_user_id: s.line_user_id } : {}),
      } as any);
    }
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    toast.success("บันทึกข้อมูลจัดส่งแล้ว");
  };


  const steps = [
    { key: "confirmed", label: "ยืนยัน", at: order.slip_verified_at },
    { key: "preparing", label: "เตรียมของ", at: order.preparing_at },
    { key: "delivering", label: "จัดส่ง", at: order.shipped_at },
    { key: "completed", label: "ส่งถึง", at: order.delivered_at },
  ];
  const order_idx = ["pending", "confirmed", "preparing", "delivering", "completed"].indexOf(order.status);

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Truck className="h-3.5 w-3.5 text-primary" /> การจัดส่ง
      </p>

      {/* Timeline */}
      <div className="flex items-center">
        {steps.map((s, i) => {
          const done = order_idx >= i + 1;
          return (
            <div key={s.key} className="flex-1 flex items-center">
              <div className="flex flex-col items-center min-w-0">
                <div className={`h-3 w-3 rounded-full ${done ? "bg-primary" : "bg-muted-foreground/30"}`} />
                <span className={`text-[10px] mt-1 ${done ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
                {s.at && <span className="text-[9px] text-muted-foreground">{new Date(s.at).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
              </div>
              {i < steps.length - 1 && <div className={`h-0.5 flex-1 mx-1 ${order_idx >= i + 2 ? "bg-primary" : "bg-muted-foreground/20"}`} />}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">ขนส่ง</Label>
          <Select value={courier} onValueChange={setCourier}>
            <SelectTrigger className="h-9 w-[190px] rounded-lg text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COURIERS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1 min-w-[150px]">
          <Label className="text-[11px]">เลขพัสดุ</Label>
          <Input className="h-9 rounded-lg text-sm" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="เช่น TH01234567" />
        </div>
        <Button size="sm" className="h-9 rounded-xl gap-1.5" onClick={save} disabled={saving}>
          <Save className="h-3.5 w-3.5" /> บันทึก & แจ้งลูกค้า
        </Button>
        {order.tracking_url && (
          <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5"
            onClick={() => { navigator.clipboard.writeText(order.tracking_url); toast.success("คัดลอกลิงก์ติดตามแล้ว"); }}>
            <Copy className="h-3.5 w-3.5" /> ลิงก์
          </Button>
        )}
      </div>

      {/* ค่าส่งกรอกเอง (คิดแยกจากค่าสินค้า) */}
      <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border/60">
        <div className="space-y-1">
          <Label className="text-[11px]">ค่าส่ง (บาท) — กรอกเอง</Label>
          <Input className="h-9 w-32 rounded-lg text-sm" type="number" min="0" value={fee}
            onChange={(e) => setFee(e.target.value)} placeholder="เช่น 40" />
        </div>
        <Button size="sm" variant="outline" className="h-9 rounded-xl gap-1.5" onClick={saveFee} disabled={savingFee}>
          <Save className="h-3.5 w-3.5" /> บันทึกค่าส่ง & แจ้งลูกค้า
        </Button>
        <p className="text-[11px] text-muted-foreground w-full">
          ค่าสินค้า ฿{(Number(order.total_amount || 0) - Number(order.shipping_fee || 0)).toLocaleString()} + ค่าส่ง ฿{Number(order.shipping_fee || 0).toLocaleString()} = รวม ฿{Number(order.total_amount || 0).toLocaleString()}
          {order.shipping_zone ? ` · โซน: ${order.shipping_zone}` : ""}
        </p>
      </div>

    </div>
  );
}
