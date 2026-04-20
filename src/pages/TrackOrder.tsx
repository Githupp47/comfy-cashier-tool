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

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  pending: { label: "รอตรวจสอบ", icon: Clock, color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" },
  confirmed: { label: "ยืนยันแล้ว", icon: CheckCircle2, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
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
    if (!phone.trim()) return toast.error("กรุณากรอกเบอร์โทร");
    setLoading(true);
    setSearched(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("customer_phone", phone.trim())
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
                {o.note && (
                  <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2">
                    📝 {o.note}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
