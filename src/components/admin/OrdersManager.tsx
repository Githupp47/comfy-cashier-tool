import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Package, ShoppingBag, Clock, CheckCircle2, XCircle,
  MapPin, MessageSquare, Eye, EyeOff, Trash2, ScanLine, Loader2, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";

type Order = Tables<"orders"> & { slip_status?: string | null; slip_data?: any; slip_reject_reason?: string | null };

export function OrdersManager({ orders, queryClient }: { orders: Order[]; queryClient: any }) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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

  const approveSlip = async (orderId: string) => {
    const { error } = await supabase.from("orders").update({
      slip_status: "approved",
      slip_verified_at: new Date().toISOString(),
      status: "confirmed",
    } as any).eq("id", orderId);
    if (error) return toast.error(error.message);
    await supabase.from("chat_messages").insert({
      order_id: orderId, sender_type: "admin",
      message: "✅ ยืนยันการชำระเงินเรียบร้อยค่ะ กำลังเตรียมออเดอร์ให้นะคะ 🙏",
    });
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
    await supabase.from("chat_messages").insert({
      order_id: orderId, sender_type: "admin",
      message: `❌ สลิปไม่ผ่านการตรวจสอบ: ${rejectReason}\nกรุณาส่งสลิปใหม่อีกครั้งค่ะ 🙏`,
    });
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
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
      if (status === "completed" || status === "delivering") {
        const msg = status === "delivering"
          ? "🚚 ออเดอร์ของคุณกำลังจัดส่งแล้วค่ะ!"
          : "✅ ออเดอร์ของคุณจัดส่งเสร็จเรียบร้อยแล้วค่ะ ขอบคุณที่อุดหนุนนะคะ 🙏";
        await supabase.from("chat_messages").insert({
          order_id: id,
          sender_type: "admin",
          message: msg,
        });
      }
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

                  <div className="flex flex-wrap gap-2">
                    {o.dormitory_map_link && (
                      <a href={o.dormitory_map_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 rounded-full transition-colors">
                        <MapPin className="h-3 w-3 text-primary" /> ดูที่อยู่หอพัก
                      </a>
                    )}
                    {o.note && <span className="inline-flex items-center gap-1.5 text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded-full"><MessageSquare className="h-3 w-3" /> {o.note}</span>}
                  </div>

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
