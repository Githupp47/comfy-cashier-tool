import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Package, ShoppingBag, Clock, CheckCircle2,
  MapPin, MessageSquare, Eye, EyeOff, Trash2
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Order = Tables<"orders">;

export function OrdersManager({ orders, queryClient }: { orders: Order[]; queryClient: any }) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

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
                    <a href={o.slip_url} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={o.slip_url} alt="สลิป" className="h-32 rounded-xl object-cover border border-border shadow-sm hover:shadow-md transition-shadow" />
                    </a>
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
