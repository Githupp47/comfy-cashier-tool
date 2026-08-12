import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Package, ShoppingBag, Clock, CheckCircle2, XCircle,
  MapPin, MessageSquare, Eye, EyeOff, Trash2, ScanLine, Loader2, AlertTriangle,
  Download, Timer
} from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";
import { ShippingPanel } from "./ShippingPanel";
import { ManualSaleDialog } from "./ManualSaleDialog";

type Order = Tables<"orders"> & { slip_status?: string | null; slip_data?: any; slip_reject_reason?: string | null };

export function OrdersManager({ orders, queryClient }: { orders: Order[]; queryClient: any }) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [maxAgeHours, setMaxAgeHours] = useState<string>("24");
  const [savingAge, setSavingAge] = useState(false);

  useEffect(() => {
    supabase.from("shop_settings").select("value").eq("key", "slip_max_age_hours").maybeSingle()
      .then(({ data }) => { if (data?.value) setMaxAgeHours(String(data.value)); });
  }, []);

  const saveMaxAge = async () => {
    const n = Math.max(1, Math.min(720, Number(maxAgeHours) || 24));
    setSavingAge(true);
    const { error } = await supabase.from("shop_settings").upsert(
      { key: "slip_max_age_hours", value: String(n) }, { onConflict: "key" }
    );
    setSavingAge(false);
    if (error) return toast.error(error.message);
    setMaxAgeHours(String(n));
    toast.success(`ตั้งค่าอายุสลิปสูงสุด ${n} ชม.`);
  };

  const exportSlipReportCsv = () => {
    const rows = orders.filter(o => o.slip_url);
    if (rows.length === 0) return toast.error("ไม่มีข้อมูลสลิป");
    const header = [
      "order_id","created_at","customer_name","customer_phone",
      "total_amount","slip_status","slip_verified_at",
      "expected_amount","slip_amount","amount_match",
      "slip_date","slip_time","ref_no","sender_name","sender_bank",
      "receiver_name","looks_edited","confidence","reject_reason","slip_url"
    ];
    const esc = (v: any) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [header.join(",")];
    for (const o of rows) {
      const d: any = o.slip_data || {};
      lines.push([
        o.id, o.created_at, o.customer_name, o.customer_phone,
        o.total_amount, o.slip_status || "pending", (o as any).slip_verified_at || "",
        d.expected_amount ?? o.total_amount, d.amount ?? "", d.amount_match ?? "",
        d.date ?? "", d.time ?? "", d.ref_no ?? (o as any).slip_ref_no ?? "",
        d.sender_name ?? "", d.sender_bank ?? "",
        d.receiver_name ?? "", d.looks_edited ?? "", d.confidence ?? "",
        o.slip_reject_reason || "", o.slip_url || ""
      ].map(esc).join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slip-report-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`ดาวน์โหลด ${rows.length} รายการ`);
  };

  const verifySlip = async (orderId: string) => {
    setVerifyingId(orderId);
    try {
      const { data, error } = await supabase.functions.invoke("verify-slip", { body: { order_id: orderId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("อ่านสลิปสำเร็จ");
    } catch (e: any) {
      toast.error(e.message || "อ่านสลิปไม่สำเร็จ");
    } finally {
      setVerifyingId(null);
    }
  };

  // ส่งข้อความหาลูกค้าทุกช่องทาง (เว็บ / LINE / FB / IG) ผ่านฟังก์ชันกลาง
  const notifyCustomer = async (orderId: string, message: string) => {
    const { error } = await supabase.functions.invoke("notify-customer", {
      body: { order_id: orderId, message },
    });
    if (error) {
      await supabase.from("chat_messages").insert({ order_id: orderId, sender_type: "admin", message });
    }
  };

  const approveSlip = async (orderId: string) => {
    const { error } = await supabase.from("orders").update({
      slip_status: "approved",
      slip_verified_at: new Date().toISOString(),
      status: "confirmed",
    } as any).eq("id", orderId);
    if (error) return toast.error(error.message);
    await notifyCustomer(orderId, `✅ ออเดอร์ #${orderId.slice(0, 8)}\nยืนยันการชำระเงินเรียบร้อยค่ะ กำลังเตรียมออเดอร์ให้นะคะ 🙏`);
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    toast.success("อนุมัติสลิปแล้ว");
  };

  const rejectSlip = async (orderId: string) => {
    if (!rejectReason.trim()) return toast.error("กรุณาระบุเหตุผล");
    const { error } = await supabase.from("orders").update({
      slip_status: "rejected",
      slip_reject_reason: rejectReason,
      slip_verified_at: new Date().toISOString(),
    } as any).eq("id", orderId);
    if (error) return toast.error(error.message);
    await notifyCustomer(orderId, `❌ ออเดอร์ #${orderId.slice(0, 8)}\nสลิปไม่ผ่านการตรวจสอบ: ${rejectReason}\nกรุณาส่งสลิปใหม่อีกครั้งค่ะ 🙏`);
    setRejectingId(null); setRejectReason("");
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    toast.success("ปฏิเสธสลิปแล้ว");
  };



  const { data: orderItems } = useQuery({
    queryKey: ["order-items", selectedOrder?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_items").select("*").eq("order_id", selectedOrder!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrder,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const now = new Date().toISOString();
      const patch: any = { status };
      if (status === "preparing") patch.preparing_at = now;
      if (status === "delivering") patch.shipped_at = now;
      if (status === "completed") patch.delivered_at = now;
      const { error } = await supabase.from("orders").update(patch).eq("id", id);
      if (error) throw error;

      const o: any = orders.find((x) => x.id === id);
      const no = `#${id.slice(0, 8)}`;
      const track = o?.tracking_number ? `\nเลขติดตาม: ${o.tracking_number}${o.tracking_url ? `\nเช็คสถานะ: ${o.tracking_url}` : ""}` : "";
      const msgs: Record<string, string> = {
        confirmed: `✅ ออเดอร์ ${no} — ยืนยันออเดอร์เรียบร้อยค่ะ (ขั้นที่ 1/4) กำลังจัดคิวให้นะคะ`,
        preparing: `👨‍🍳 ออเดอร์ ${no} — กำลังเตรียมสินค้า (ขั้นที่ 2/4) ค่ะ`,
        delivering: `🚚 ออเดอร์ ${no} — ออกจากร้านแล้ว กำลังจัดส่ง (ขั้นที่ 3/4)${track}`,
        completed: `📬 ออเดอร์ ${no} — จัดส่งถึงเรียบร้อย (ขั้นที่ 4/4) ขอบคุณที่อุดหนุนนะคะ 🙏`,
        cancelled: `❌ ออเดอร์ ${no} ถูกยกเลิกค่ะ หากมีข้อสงสัยทักแชทได้เลยนะคะ`,
      };
      if (msgs[status]) await notifyCustomer(id, msgs[status]);

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("อัพเดตสถานะสำเร็จ");
    },
  });

  const deleteOrder = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("order_items").delete().eq("order_id", id);
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("ลบออเดอร์สำเร็จ");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: "รอตรวจสอบ", color: "bg-amber-100 text-amber-800 border-amber-200", icon: <Clock className="h-3 w-3" /> },
    confirmed: { label: "ยืนยันแล้ว", color: "bg-blue-100 text-blue-800 border-blue-200", icon: <CheckCircle2 className="h-3 w-3" /> },
    preparing: { label: "กำลังเตรียม", color: "bg-purple-100 text-purple-800 border-purple-200", icon: <Package className="h-3 w-3" /> },
    delivering: { label: "กำลังจัดส่ง", color: "bg-cyan-100 text-cyan-800 border-cyan-200", icon: <MapPin className="h-3 w-3" /> },
    completed: { label: "เสร็จสิ้น", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
    cancelled: { label: "ยกเลิก", color: "bg-red-100 text-red-800 border-red-200", icon: <Trash2 className="h-3 w-3" /> },
  };

  const filteredOrders = filterStatus === "all" ? orders : orders.filter(o => o.status === filterStatus);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">🛒 จัดการออเดอร์</h2>
          <p className="text-sm text-muted-foreground">{orders.length} ออเดอร์ทั้งหมด</p>
        </div>
        <div className="flex items-center gap-2">
        <ManualSaleDialog onDone={() => {
          queryClient?.invalidateQueries({ queryKey: ["admin-orders"] });
          queryClient?.invalidateQueries({ queryKey: ["dashboard-order-items"] });
          queryClient?.invalidateQueries({ queryKey: ["dashboard-products"] });
          queryClient?.invalidateQueries({ queryKey: ["admin-products"] });
        }} />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px] rounded-xl"><SelectValue placeholder="กรองสถานะ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทั้งหมด</SelectItem>
            <SelectItem value="pending">⏳ รอตรวจสอบ</SelectItem>
            <SelectItem value="confirmed">✅ ยืนยันแล้ว</SelectItem>
            <SelectItem value="preparing">👨‍🍳 กำลังเตรียม</SelectItem>
            <SelectItem value="delivering">🚗 กำลังจัดส่ง</SelectItem>
            <SelectItem value="completed">✅ เสร็จสิ้น</SelectItem>
            <SelectItem value="cancelled">❌ ยกเลิก</SelectItem>
          </SelectContent>
        </Select>
        </div>
      </div>


      <Card className="border-border">
        <CardContent className="p-3 flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1"><Timer className="h-3 w-3" /> อายุสลิปสูงสุด (ชม.)</Label>
              <Input
                type="number" min={1} max={720}
                value={maxAgeHours}
                onChange={(e) => setMaxAgeHours(e.target.value)}
                className="h-9 w-24 rounded-lg"
              />
            </div>
            <Button size="sm" variant="outline" className="rounded-xl h-9" onClick={saveMaxAge} disabled={savingAge}>
              {savingAge ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "บันทึก"}
            </Button>
            <p className="text-[11px] text-muted-foreground max-w-[220px] leading-tight">
              บอทจะปฏิเสธสลิปที่เก่ากว่านี้อัตโนมัติ
            </p>
          </div>
          <div className="ml-auto">
            <Button size="sm" variant="outline" className="rounded-xl h-9 gap-1.5" onClick={exportSlipReportCsv}>
              <Download className="h-3.5 w-3.5" /> ดาวน์โหลดรายงานสลิป (CSV)
            </Button>
          </div>
        </CardContent>
      </Card>


      <div className="grid gap-3">
        {filteredOrders.map((o) => {
          const sc = statusConfig[o.status];
          return (
            <Card key={o.id} className={`border-border overflow-hidden transition-all ${o.status === "pending" ? "ring-2 ring-primary/20 border-primary/30" : ""}`}>
              <CardContent className="p-0">
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-bold text-foreground text-base">{o.customer_name}</p>
                      <p className="text-sm text-muted-foreground">📱 {o.customer_phone}</p>
                      <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("th-TH")}</p>
                    </div>
                    <div className="text-right space-y-1.5">
                      <p className="text-xl font-bold text-primary">฿{o.total_amount}</p>
                      {sc && <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${sc.color}`}>{sc.icon} {sc.label}</span>}
                    </div>
                  </div>

                  {(o.dormitory_map_link || o.shipping_zone || o.note) && (
                    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                      {o.shipping_zone && (
                        <p className="text-xs text-muted-foreground">🚚 โซนจัดส่ง: <span className="text-foreground font-medium">{o.shipping_zone}</span></p>
                      )}
                      {o.dormitory_map_link && (
                        <div className="space-y-1.5">
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" /> ที่อยู่ / หอพักที่ลูกค้ากรอก</p>
                          <p className="text-sm text-foreground break-words whitespace-pre-wrap">{o.dormitory_map_link}</p>
                          <div className="flex flex-wrap gap-2">
                            {/^https?:\/\//i.test(o.dormitory_map_link.trim()) && (
                              <a href={o.dormitory_map_link.trim()} target="_blank" rel="noopener noreferrer"
                                className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors">
                                เปิดลิงก์แผนที่
                              </a>
                            )}
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.dormitory_map_link.trim())}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-xs bg-muted px-3 py-1.5 rounded-full hover:bg-muted/70 transition-colors">
                              ค้นหาใน Google Maps
                            </a>
                            <button
                              onClick={() => { navigator.clipboard.writeText(o.dormitory_map_link || ""); toast.success("คัดลอกที่อยู่แล้ว"); }}
                              className="text-xs bg-muted px-3 py-1.5 rounded-full hover:bg-muted/70 transition-colors">
                              คัดลอกที่อยู่
                            </button>
                          </div>
                        </div>
                      )}
                      {o.note && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" /> <span className="text-foreground whitespace-pre-wrap break-words">{o.note}</span>
                        </p>
                      )}
                      {Number((o as any).discount_amount) > 0 && (
                        <p className="text-xs text-emerald-700">🏷️ ส่วนลด ฿{Number((o as any).discount_amount).toLocaleString()} {(o as any).promotion_code ? `(${(o as any).promotion_code})` : ""}</p>
                      )}
                    </div>
                  )}

                  {o.slip_url && (
                    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-start gap-3">
                        <a href={o.slip_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <img src={o.slip_url} alt="สลิป" className="h-28 w-28 rounded-lg object-cover border border-border" />
                        </a>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground">สลิปโอนเงิน</span>
                            {o.slip_status === "approved" && <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">✅ อนุมัติอัตโนมัติ</span>}
                            {o.slip_status === "rejected" && <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full border border-red-200">❌ ปฏิเสธ</span>}
                            {o.slip_status === "needs_review" && <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full border border-orange-200 animate-pulse">⚠️ ต้องตรวจ</span>}
                            {(!o.slip_status || o.slip_status === "pending") && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">⏳ กำลังตรวจ</span>}
                          </div>
                          {o.slip_data ? (
                            <div className="text-xs space-y-0.5 bg-background/60 rounded-lg p-2 border border-border/50">
                              <div className="flex justify-between gap-2">
                                <span className="text-muted-foreground">ยอด:</span>
                                <span className={`font-medium ${o.slip_data.amount_match ? "text-emerald-700" : "text-red-600"}`}>
                                  ฿{o.slip_data.amount ?? "-"} {o.slip_data.amount_match ? "✓" : `≠ ฿${o.slip_data.expected_amount}`}
                                </span>
                              </div>
                              {o.slip_data.date && <div className="flex justify-between gap-2"><span className="text-muted-foreground">วันที่:</span><span>{o.slip_data.date} {o.slip_data.time || ""}</span></div>}
                              {o.slip_data.ref_no && <div className="flex justify-between gap-2"><span className="text-muted-foreground">อ้างอิง:</span><span className="font-mono truncate">{o.slip_data.ref_no}</span></div>}
                              {o.slip_data.sender_name && <div className="flex justify-between gap-2"><span className="text-muted-foreground">จาก:</span><span className="truncate">{o.slip_data.sender_name} {o.slip_data.sender_bank ? `(${o.slip_data.sender_bank})` : ""}</span></div>}
                              {o.slip_data.receiver_name && <div className="flex justify-between gap-2"><span className="text-muted-foreground">เข้า:</span><span className="truncate">{o.slip_data.receiver_name}</span></div>}
                              {o.slip_data.is_slip === false && <div className="text-red-600 flex items-center gap-1 mt-1"><AlertTriangle className="h-3 w-3" /> รูปนี้อาจไม่ใช่สลิป</div>}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">ยังไม่ได้อ่านข้อมูลสลิป</p>
                          )}
                          {o.slip_status === "rejected" && o.slip_reject_reason && (
                            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-1.5">เหตุผล: {o.slip_reject_reason}</p>
                          )}
                        </div>
                      </div>
                      {o.slip_status !== "approved" && (
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="rounded-xl gap-1.5 h-8 text-xs" onClick={() => verifySlip(o.id)} disabled={verifyingId === o.id}>
                            {verifyingId === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                            {o.slip_data ? "อ่านสลิปใหม่" : "อ่านสลิป (AI)"}
                          </Button>
                          <Button size="sm" className="rounded-xl gap-1.5 h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => approveSlip(o.id)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติ
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-xl gap-1.5 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { setRejectingId(o.id); setRejectReason(""); }}>
                            <XCircle className="h-3.5 w-3.5" /> ปฏิเสธ
                          </Button>
                        </div>
                      )}
                      {rejectingId === o.id && (
                        <div className="space-y-2 pt-2 border-t border-border/50">
                          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="ระบุเหตุผลที่ปฏิเสธ (เช่น ยอดไม่ตรง, สลิปเบลอ, ปลายทางผิด)" className="text-xs rounded-lg min-h-[60px]" />
                          <div className="flex gap-2">
                            <Button size="sm" variant="destructive" className="rounded-xl h-8 text-xs" onClick={() => rejectSlip(o.id)}>ยืนยันปฏิเสธ</Button>
                            <Button size="sm" variant="ghost" className="rounded-xl h-8 text-xs" onClick={() => setRejectingId(null)}>ยกเลิก</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={o.status} onValueChange={(v) => updateStatus.mutate({ id: o.id, status: v })}>
                      <SelectTrigger className="w-[170px] rounded-xl text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">⏳ รอตรวจสอบ</SelectItem>
                        <SelectItem value="confirmed">✅ ยืนยันแล้ว</SelectItem>
                        <SelectItem value="preparing">👨‍🍳 กำลังเตรียม</SelectItem>
                        <SelectItem value="delivering">🚗 กำลังจัดส่ง</SelectItem>
                        <SelectItem value="completed">✅ เสร็จสิ้น</SelectItem>
                        <SelectItem value="cancelled">❌ ยกเลิก</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="rounded-xl gap-1.5"
                      onClick={() => setSelectedOrder(selectedOrder?.id === o.id ? null : o)}>
                      {selectedOrder?.id === o.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      {selectedOrder?.id === o.id ? "ซ่อน" : "ดูรายการ"}
                    </Button>
                    {o.status === "cancelled" && (
                      <Button variant="outline" size="sm" className="rounded-xl gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30"
                        onClick={() => { if (confirm("ลบออเดอร์นี้ถาวร?")) deleteOrder.mutate(o.id); }}>
                        <Trash2 className="h-3.5 w-3.5" /> ลบ
                      </Button>
                    )}
                  </div>

                  {o.status !== "cancelled" && <ShippingPanel order={o} queryClient={queryClient} />}

                  {selectedOrder?.id === o.id && orderItems && (
                    <div className="mt-1 bg-muted/30 rounded-xl p-3 border border-border/50 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground mb-2">รายการสินค้า</p>
                      {orderItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <span className="text-foreground">{item.product_name} <span className="text-muted-foreground">x{item.quantity}</span></span>
                          <span className="font-medium text-primary">฿{item.price * item.quantity}</span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between font-bold text-sm">
                        <span className="text-foreground">รวม</span>
                        <span className="text-primary">฿{o.total_amount}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredOrders.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>ไม่มีออเดอร์{filterStatus !== "all" ? "ในสถานะนี้" : ""}</p>
          </div>
        )}
      </div>
    </div>
  );
}
