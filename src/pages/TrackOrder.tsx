import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Package, Clock, Truck, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  { key: "confirmed", label: "ยืนยันแล้ว", emoji: "✅" },
  { key: "preparing", label: "กำลังเตรียม", emoji: "👨‍🍳" },
  { key: "delivering", label: "กำลังจัดส่ง", emoji: "🚚" },
  { key: "completed", label: "ส่งถึงแล้ว", emoji: "📬" },
];
const ORDER_FLOW = ["pending", "confirmed", "preparing", "delivering", "completed"];

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "รอตรวจสอบ", icon: Clock, color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" },
  confirmed: { label: "ยืนยันแล้ว", icon: CheckCircle2, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  preparing: { label: "กำลังเตรียม", icon: Package, color: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
  delivering: { label: "กำลังจัดส่ง", icon: Truck, color: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
  completed: { label: "ส่งเสร็จสิ้น", icon: CheckCircle2, color: "bg-green-500/10 text-green-700 dark:text-green-400" },
  cancelled: { label: "ยกเลิก", icon: XCircle, color: "bg-destructive/10 text-destructive" },
};

export default function TrackOrder() {
  const [searchParams] = useSearchParams();
  const [phone, setPhone] = useState(searchParams.get("phone") || "");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    const q = phone.trim();
    if (!q) return toast.error("กรุณากรอกเบอร์โทร หรือเลขติดตาม");
    setLoading(true);
    setSearched(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .or(`customer_phone.eq.${q},tracking_number.eq.${q}`)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOrders(data || []);
  };


  useEffect(() => {
    if (searchParams.get("phone")) {
      search();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background pb-12">
      <Navbar />
      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" /> ตรวจสอบออเดอร์
        </h1>

        <Card className="border-border">
          <CardContent className="p-4 flex gap-2">
            <Input
              className="rounded-xl flex-1"
              placeholder="กรอกเบอร์โทรศัพท์..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <Button className="rounded-xl" onClick={search} disabled={loading}>
              {loading ? "..." : "ค้นหา"}
            </Button>
          </CardContent>
        </Card>

        {searched && orders.length === 0 && !loading && (
          <Card className="border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>ไม่พบออเดอร์ของเบอร์นี้</p>
            </CardContent>
          </Card>
        )}

        {orders.map((o) => {
          const cfg = statusConfig[o.status] || statusConfig.pending;
          const Icon = cfg.icon;
          return (
            <Card key={o.id} className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    ออเดอร์ #{o.id.slice(0, 8)}
                  </CardTitle>
                  <Badge className={`${cfg.color} border-0 gap-1`}>
                    <Icon className="h-3 w-3" /> {cfg.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleString("th-TH")}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1">
                  {o.order_items?.map((it: any) => (
                    <div key={it.id} className="flex justify-between text-sm">
                      <span className="text-foreground">{it.product_name} × {it.quantity}</span>
                      <span className="text-muted-foreground">฿{(Number(it.price) * it.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-2 flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">รวม</span>
                  <span className="text-lg font-bold text-primary">฿{Number(o.total_amount).toLocaleString()}</span>
                </div>
                {o.status !== "cancelled" && (
                  <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center">
                      {STEPS.map((st, i) => {
                        const done = ORDER_FLOW.indexOf(o.status) >= i + 1;
                        const at = [null, o.preparing_at, o.shipped_at, o.delivered_at][i];
                        return (
                          <div key={st.key} className="flex-1 flex items-center">
                            <div className="flex flex-col items-center">
                              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                {st.emoji}
                              </div>
                              <span className={`text-[10px] mt-1 ${done ? "text-foreground font-medium" : "text-muted-foreground"}`}>{st.label}</span>
                              {at && <span className="text-[9px] text-muted-foreground">{new Date(at).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>}
                            </div>
                            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 mx-1 ${ORDER_FLOW.indexOf(o.status) >= i + 2 ? "bg-primary" : "bg-border"}`} />}
                          </div>
                        );
                      })}
                    </div>
                    {(o.tracking_number || o.shipping_zone) && (
                      <div className="text-xs space-y-1 pt-1 border-t border-border/50">
                        {o.shipping_zone && <p className="text-muted-foreground">โซนจัดส่ง: {o.shipping_zone} · ค่าส่ง ฿{Number(o.shipping_fee || 0).toLocaleString()}</p>}
                        {o.tracking_number && (
                          <p className="flex items-center gap-1.5 flex-wrap">
                            <Truck className="h-3.5 w-3.5 text-primary" />
                            <span className="font-mono font-medium">{o.tracking_number}</span>
                            {o.tracking_url && (
                              <a href={o.tracking_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">ติดตามพัสดุ</a>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {o.note && (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2">
                    📝 {o.note}
                  </p>
                )}
                {o.slip_status && (
                  <div className={`text-xs rounded-lg p-2 border ${
                    o.slip_status === "approved" ? "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400" :
                    o.slip_status === "rejected" ? "bg-destructive/10 border-destructive/30 text-destructive" :
                    o.slip_status === "needs_review" ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400" :
                    "bg-muted/30 border-border text-muted-foreground"
                  }`}>
                    <p className="font-medium">
                      สถานะสลิป: {
                        o.slip_status === "approved" ? "✅ ยืนยันแล้ว" :
                        o.slip_status === "rejected" ? "❌ ปฏิเสธ" :
                        o.slip_status === "needs_review" ? "⏳ ต้องตรวจสอบ" :
                        "⏳ รอตรวจสอบ"
                      }
                    </p>
                    {o.slip_reject_reason && (
                      <p className="mt-1 opacity-90">เหตุผล: {o.slip_reject_reason}</p>
                    )}
                    {o.slip_data?.amount && (
                      <p className="mt-1 opacity-80">
                        ยอด ฿{Number(o.slip_data.amount).toLocaleString()} / ต้องโอน ฿{Number(o.total_amount).toLocaleString()}
                        {o.slip_data.ref_no && ` · อ้างอิง ${o.slip_data.ref_no}`}
                      </p>
                    )}
                    {o.slip_status === "rejected" && (
                      <p className="mt-1">กรุณาส่งสลิปที่ถูกต้องผ่านแชท 💬</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
