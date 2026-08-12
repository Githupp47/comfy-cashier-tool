import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tag, Plus, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { promoLabel, type Promotion } from "@/lib/promotions";

const empty = {
  name: "",
  code: "",
  discount_type: "percent",
  discount_value: 10,
  min_order_amount: 0,
  max_discount: "",
  free_shipping: false,
  is_active: true,
  starts_at: "",
  ends_at: "",
  usage_limit: "",
  description: "",
};

export function PromotionsManager() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: promos = [], isLoading } = useQuery({
    queryKey: ["admin-promotions"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("promotions")
        .select("*").order("sort_order").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Promotion[];
    },
  });

  const reset = () => { setForm(empty); setEditingId(null); };

  const save = async () => {
    if (!form.name.trim()) return toast.error("กรุณาตั้งชื่อโปรโมชั่น");
    if (Number(form.discount_value) <= 0 && !form.free_shipping) return toast.error("กรุณาระบุส่วนลด");
    setSaving(true);
    const payload: any = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value) || 0,
      min_order_amount: Number(form.min_order_amount) || 0,
      max_discount: form.max_discount === "" ? null : Number(form.max_discount),
      free_shipping: !!form.free_shipping,
      is_active: !!form.is_active,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      usage_limit: form.usage_limit === "" ? null : Number(form.usage_limit),
      description: form.description.trim() || null,
    };
    const { error } = editingId
      ? await (supabase.from as any)("promotions").update(payload).eq("id", editingId)
      : await (supabase.from as any)("promotions").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editingId ? "แก้ไขโปรโมชั่นแล้ว" : "เพิ่มโปรโมชั่นแล้ว");
    reset();
    queryClient.invalidateQueries({ queryKey: ["admin-promotions"] });
    queryClient.invalidateQueries({ queryKey: ["promotions"] });
  };

  const edit = (p: Promotion) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      code: p.code ?? "",
      discount_type: p.discount_type,
      discount_value: Number(p.discount_value),
      min_order_amount: Number(p.min_order_amount),
      max_discount: p.max_discount == null ? "" : Number(p.max_discount),
      free_shipping: p.free_shipping,
      is_active: p.is_active,
      starts_at: p.starts_at ? p.starts_at.slice(0, 16) : "",
      ends_at: p.ends_at ? p.ends_at.slice(0, 16) : "",
      usage_limit: p.usage_limit == null ? "" : p.usage_limit,
      description: p.description ?? "",
    });
  };

  const toggle = async (p: Promotion) => {
    const { error } = await (supabase.from as any)("promotions").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["admin-promotions"] });
    queryClient.invalidateQueries({ queryKey: ["promotions"] });
  };

  const remove = async (p: Promotion) => {
    if (!confirm(`ลบโปรโมชั่น "${p.name}" ?`)) return;
    const { error } = await (supabase.from as any)("promotions").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("ลบแล้ว");
    queryClient.invalidateQueries({ queryKey: ["admin-promotions"] });
    queryClient.invalidateQueries({ queryKey: ["promotions"] });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary" /> โปรโมชั่น & ส่วนลด
        </h2>
        <p className="text-sm text-muted-foreground">ตั้งส่วนลดที่นี่ ระบบหน้าเว็บและบอทจะคิดส่วนลดให้อัตโนมัติ</p>
      </div>

      <Card className="border-border">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{editingId ? "แก้ไขโปรโมชั่น" : "เพิ่มโปรโมชั่นใหม่"}</p>
            {editingId && (
              <Button variant="ghost" size="sm" className="rounded-xl gap-1" onClick={reset}>
                <X className="h-3.5 w-3.5" /> ยกเลิก
              </Button>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">ชื่อโปรโมชั่น *</Label>
              <Input className="rounded-xl" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น ลด 10% ครบ 300" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">โค้ดส่วนลด (เว้นว่าง = ลดอัตโนมัติ)</Label>
              <Input className="rounded-xl uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="เช่น HAKKO10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">ประเภทส่วนลด</Label>
              <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">เปอร์เซ็นต์ (%)</SelectItem>
                  <SelectItem value="fixed">จำนวนเงิน (บาท)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">มูลค่าส่วนลด</Label>
              <Input className="rounded-xl" type="number" min="0" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">ยอดขั้นต่ำ (บาท)</Label>
              <Input className="rounded-xl" type="number" min="0" value={form.min_order_amount} onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">ลดสูงสุด (บาท, เว้นว่าง = ไม่จำกัด)</Label>
              <Input className="rounded-xl" type="number" min="0" value={form.max_discount} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">เริ่ม (เว้นว่าง = ทันที)</Label>
              <Input className="rounded-xl" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">สิ้นสุด (เว้นว่าง = ไม่จำกัด)</Label>
              <Input className="rounded-xl" type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">จำกัดจำนวนสิทธิ์ (เว้นว่าง = ไม่จำกัด)</Label>
              <Input className="rounded-xl" type="number" min="1" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4">
              <Label className="text-sm">ส่งฟรีด้วย</Label>
              <Switch checked={form.free_shipping} onCheckedChange={(v) => setForm({ ...form, free_shipping: v })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">รายละเอียด (บอทจะใช้ข้อความนี้อธิบายลูกค้า)</Label>
            <Textarea className="rounded-xl" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="เช่น ซื้อครบ 300 ลด 10% เฉพาะเดือนนี้" />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <Label className="text-sm">เปิดใช้งานทันที</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>

          <Button onClick={save} disabled={saving} className="w-full rounded-xl h-11 gap-2">
            <Plus className="h-4 w-4" /> {saving ? "กำลังบันทึก..." : editingId ? "บันทึกการแก้ไข" : "เพิ่มโปรโมชั่น"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
      ) : promos.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีโปรโมชั่น</p>
      ) : (
        <div className="grid gap-3">
          {promos.map((p) => (
            <Card key={p.id} className={`border-border ${p.is_active ? "" : "opacity-60"}`}>
              <CardContent className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">{p.name}</p>
                    {p.code && <span className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full">{p.code}</span>}
                    {!p.code && <span className="text-[11px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">อัตโนมัติ</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">{promoLabel(p)}</p>
                  {(p.starts_at || p.ends_at) && (
                    <p className="text-xs text-muted-foreground">
                      {p.starts_at ? new Date(p.starts_at).toLocaleString("th-TH") : "—"} → {p.ends_at ? new Date(p.ends_at).toLocaleString("th-TH") : "ไม่จำกัด"}
                    </p>
                  )}
                  {p.usage_limit != null && <p className="text-xs text-muted-foreground">ใช้ไป {p.used_count}/{p.usage_limit} สิทธิ์</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch checked={p.is_active} onCheckedChange={() => toggle(p)} />
                  <Button size="icon" variant="ghost" className="rounded-xl" onClick={() => edit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="rounded-xl text-destructive" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
