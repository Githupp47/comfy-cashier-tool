import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tag, Plus, Trash2, Pencil, X, ImagePlus, Send, Sparkles, Users, Loader2 } from "lucide-react";
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
  per_customer_limit: "1",
  description: "",
  internal_note: "",
  is_test: false,
  image_url: "",
};

function BroadcastDialog({ promo, onClose }: { promo: Promotion | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [testMode, setTestMode] = useState(true);
  const [testUserId, setTestUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);
  const [status, setStatus] = useState<string>("");

  const writeCaption = async () => {
    if (!promo) return;
    setWriting(true);
    const { data, error } = await supabase.functions.invoke("promo-caption", {
      body: { promo, is_test: promo.is_test },
    });
    setWriting(false);
    if (error || data?.error) return toast.error(data?.error ?? error!.message);
    setText(data.caption ?? "");
  };

  const checkLine = async () => {
    setBusy(true);
    setStatus("");
    const { data, error } = await supabase.functions.invoke("line-broadcast", { body: { diagnose: true } });
    setBusy(false);
    if (error || data?.error) return toast.error(data?.error ?? error!.message);
    if (!data.token_valid) {
      setStatus("❌ โทเคนไลน์ใช้ไม่ได้ — ออก Channel access token ใหม่แล้วบันทึกในแท็บเชื่อมต่อแชท");
      return;
    }
    const q = data.quota ?? {};
    setStatus(
      `✅ เชื่อมไลน์ได้: ${data.bot_info?.displayName ?? "OA"} · โควตาส่ง: ${q.type === "none" ? "ไม่จำกัด" : (q.value ?? "-")} · เพื่อนที่เคยทักแชท: ${data.known_chat_users} คน`,
    );
  };

  const send = async () => {
    if (!text.trim()) return toast.error("ใส่ข้อความก่อนนะคะ");
    if (testMode && !testUserId.trim()) return toast.error("โหมดทดสอบต้องใส่ LINE User ID ผู้รับ");
    setBusy(true);
    setStatus("");
    const { data, error } = await supabase.functions.invoke("line-broadcast", {
      body: {
        message: text,
        image_url: promo?.image_url ?? null,
        test_mode: testMode,
        test_user_id: testUserId.trim(),
      },
    });
    setBusy(false);
    if (error || data?.error) {
      const msg = data?.error ?? error!.message;
      setStatus(`❌ ${msg}`);
      return toast.error(msg);
    }
    if (data.note) setStatus(`✅ ${data.note}`);
    toast.success(
      testMode
        ? "ส่งข้อความทดสอบแล้ว"
        : data.mode === "multicast"
        ? `ส่งโปรฯ ถึงเพื่อนไลน์ ${data.sent} คนแล้ว 🎉`
        : "ยิงโปรฯ เข้าไลน์เพื่อนทั้งหมดแล้ว 🎉",
    );
    if (!data.note) onClose();
  };


  return (
    <Dialog open={!!promo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>ยิงโปรฯ เข้าไลน์ — {promo?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {promo?.image_url && (
            <img src={promo.image_url} alt={promo.name} className="w-full rounded-xl border border-border" />
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">ข้อความชวนซื้อ</Label>
              <Button size="sm" variant="ghost" className="rounded-xl gap-1" onClick={writeCaption} disabled={writing}>
                {writing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} ให้บอทเขียนให้
              </Button>
            </div>
            <Textarea rows={6} className="rounded-xl" value={text} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์เอง หรือกดให้บอทเขียนให้" />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <div>
              <Label className="text-sm">โหมดทดสอบระบบ</Label>
              <p className="text-xs text-muted-foreground">ส่งหาไลน์ไอดีที่ระบุเท่านั้น ไม่ถึงลูกค้าจริง</p>
            </div>
            <Switch checked={testMode} onCheckedChange={setTestMode} />
          </div>
          {testMode ? (
            <Input className="rounded-xl" value={testUserId} onChange={(e) => setTestUserId(e.target.value)} placeholder="LINE User ID ของคุณ (Uxxxxxxxx...)" />
          ) : (
            <p className="text-xs text-destructive">⚠️ จะส่งหาเพื่อนไลน์ของร้านทั้งหมด</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={onClose}>ยกเลิก</Button>
          <Button className="rounded-xl gap-2" onClick={send} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} ส่ง
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RedemptionsDialog({ promo, onClose }: { promo: Promotion | null; onClose: () => void }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["promo-redemptions-admin", promo?.id],
    enabled: !!promo,
    queryFn: async () => {
      const { data } = await (supabase.from as any)("promotion_redemptions")
        .select("*").eq("promotion_id", promo!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <Dialog open={!!promo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>คนที่ใช้สิทธิ์ — {promo?.name}</DialogTitle></DialogHeader>
        {isLoading ? <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
          : rows.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีใครใช้</p>
          : (
            <div className="space-y-2">
              {rows.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-border p-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.customer_name || "ไม่ระบุชื่อ"}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.customer_key} · {r.channel}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(r.created_at).toLocaleDateString("th-TH")}
                  </span>
                </div>
              ))}
            </div>
          )}
      </DialogContent>
    </Dialog>
  );
}

export function PromotionsManager() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [broadcastPromo, setBroadcastPromo] = useState<Promotion | null>(null);
  const [usersPromo, setUsersPromo] = useState<Promotion | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const uploadImage = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `promos/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    setForm((f: any) => ({ ...f, image_url: data.publicUrl }));
    setUploading(false);
    toast.success("อัปโหลดรูปโปรฯ แล้ว");
  };

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
      per_customer_limit: ["", "0", "none"].includes(String(form.per_customer_limit)) ? null : Number(form.per_customer_limit),
      description: form.description.trim() || null,
      internal_note: form.internal_note.trim() || null,
      is_test: !!form.is_test,
      image_url: form.image_url || null,
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
    queryClient.invalidateQueries({ queryKey: ["promotions-active"] });
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
      per_customer_limit: p.per_customer_limit == null ? "none" : String(p.per_customer_limit),
      description: p.description ?? "",
      internal_note: p.internal_note ?? "",
      is_test: !!p.is_test,
      image_url: p.image_url ?? "",
    });
  };

  const toggle = async (p: Promotion) => {
    const { error } = await (supabase.from as any)("promotions").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["admin-promotions"] });
    queryClient.invalidateQueries({ queryKey: ["promotions"] });
    queryClient.invalidateQueries({ queryKey: ["promotions-active"] });
  };

  const remove = async (p: Promotion) => {
    if (!confirm(`ลบโปรโมชั่น "${p.name}" ?`)) return;
    const { error } = await (supabase.from as any)("promotions").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("ลบแล้ว");
    queryClient.invalidateQueries({ queryKey: ["admin-promotions"] });
    queryClient.invalidateQueries({ queryKey: ["promotions"] });
    queryClient.invalidateQueries({ queryKey: ["promotions-active"] });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary" /> โปรโมชั่น & ส่วนลด
        </h2>
        <p className="text-sm text-muted-foreground">ตั้งส่วนลดที่นี่ ระบบหน้าเว็บและบอทจะคิดส่วนลดและแนะนำโปรฯ ให้ลูกค้าอัตโนมัติ</p>
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
              <Label className="text-sm">จำกัดจำนวนสิทธิ์รวม (เว้นว่าง = ไม่จำกัด)</Label>
              <Input className="rounded-xl" type="number" min="1" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">จำกัดต่อคน</Label>
              <Select value={form.per_customer_limit} onValueChange={(v) => setForm({ ...form, per_customer_limit: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 ครั้ง/คน</SelectItem>
                  <SelectItem value="2">2 ครั้ง/คน</SelectItem>
                  <SelectItem value="3">3 ครั้ง/คน</SelectItem>
                  <SelectItem value="none">ไม่จำกัด</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4">
              <Label className="text-sm">ส่งฟรีด้วย</Label>
              <Switch checked={form.free_shipping} onCheckedChange={(v) => setForm({ ...form, free_shipping: v })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">รูปโปรโมชั่น (ใช้ยิงเข้าไลน์)</Label>
            <div className="flex items-center gap-3">
              {form.image_url && (
                <img src={form.image_url} alt="โปรโมชั่น" className="h-20 w-20 rounded-xl object-cover border border-border" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.currentTarget.value = ""; }}
              />
              <Button variant="outline" className="rounded-xl gap-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} อัปโหลดรูป
              </Button>
              {form.image_url && (
                <Button variant="ghost" className="rounded-xl text-destructive gap-1" onClick={() => setForm({ ...form, image_url: "" })}>
                  <Trash2 className="h-4 w-4" /> ลบรูป
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">รายละเอียด (บอทจะใช้ข้อความนี้อธิบายลูกค้า)</Label>
            <Textarea className="rounded-xl" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="เช่น ซื้อครบ 300 ลด 10% เฉพาะเดือนนี้" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">หมายเหตุภายใน (ลูกค้าไม่เห็น)</Label>
            <Input className="rounded-xl" value={form.internal_note} onChange={(e) => setForm({ ...form, internal_note: e.target.value })} placeholder="เช่น โปรทดสอบระบบ" />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <div>
              <Label className="text-sm">โปรฯ ทดสอบระบบ</Label>
              <p className="text-xs text-muted-foreground">บอทจะไม่เอาไปแนะนำลูกค้า ใช้ทดลองเท่านั้น</p>
            </div>
            <Switch checked={form.is_test} onCheckedChange={(v) => setForm({ ...form, is_test: v })} />
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
                <div className="flex gap-3 min-w-0">
                  {p.image_url && (
                    <img src={p.image_url} alt={p.name} className="h-16 w-16 rounded-xl object-cover border border-border shrink-0" />
                  )}
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{p.name}</p>
                      {p.code && <span className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full">{p.code}</span>}
                      {!p.code && <span className="text-[11px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">อัตโนมัติ</span>}
                      {p.is_test && <span className="text-[11px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">🧪 ทดสอบ</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">{promoLabel(p)}</p>
                    {(p.starts_at || p.ends_at) && (
                      <p className="text-xs text-muted-foreground">
                        {p.starts_at ? new Date(p.starts_at).toLocaleString("th-TH") : "—"} → {p.ends_at ? new Date(p.ends_at).toLocaleString("th-TH") : "ไม่จำกัด"}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {p.per_customer_limit ? `จำกัด ${p.per_customer_limit} ครั้ง/คน` : "ไม่จำกัดต่อคน"}
                      {p.usage_limit != null ? ` · ใช้ไป ${p.used_count}/${p.usage_limit} สิทธิ์` : ` · ใช้ไป ${p.used_count} ครั้ง`}
                    </p>
                    {p.internal_note && <p className="text-xs italic text-muted-foreground">📝 {p.internal_note}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch checked={p.is_active} onCheckedChange={() => toggle(p)} />
                  <Button size="icon" variant="ghost" className="rounded-xl" title="ยิงเข้าไลน์" onClick={() => setBroadcastPromo(p)}><Send className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="rounded-xl" title="คนที่ใช้สิทธิ์" onClick={() => setUsersPromo(p)}><Users className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="rounded-xl" onClick={() => edit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="rounded-xl text-destructive" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BroadcastDialog promo={broadcastPromo} onClose={() => setBroadcastPromo(null)} />
      <RedemptionsDialog promo={usersPromo} onClose={() => setUsersPromo(null)} />
    </div>
  );
}
