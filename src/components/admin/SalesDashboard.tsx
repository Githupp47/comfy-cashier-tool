import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, AlertTriangle, ShieldCheck, PackageX } from "lucide-react";

export function SalesDashboard() {
  const { data: items } = useQuery({
    queryKey: ["dashboard-order-items"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("order_items")
        .select("product_name, product_id, quantity, price, created_at")
        .gte("created_at", since.toISOString())
        .not("product_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["dashboard-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, stock_quantity").order("stock_quantity");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["dashboard-orders-slip"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("orders")
        .select("id, slip_status")
        .gte("created_at", since.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  // Top selling
  const top = (() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    (items ?? []).forEach((i: any) => {
      const key = i.product_name;
      const cur = map.get(key) ?? { name: key, qty: 0, revenue: 0 };
      cur.qty += Number(i.quantity);
      cur.revenue += Number(i.price) * Number(i.quantity);
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  })();

  const lowStock = (products ?? []).filter((p) => p.stock_quantity <= 5);
  const outOfStock = lowStock.filter((p) => p.stock_quantity <= 0);

  // Slip approval stats
  const total = orders?.length ?? 0;
  const approved = orders?.filter((o) => o.slip_status === "approved").length ?? 0;
  const rejected = orders?.filter((o) => o.slip_status === "rejected").length ?? 0;
  const needsReview = orders?.filter((o) => o.slip_status === "needs_review").length ?? 0;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">📊 ภาพรวม 30 วันย้อนหลัง</h2>
        <p className="text-sm text-muted-foreground">สินค้าขายดี สต็อกใกล้หมด และอัตราอนุมัติสลิป</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" /> สินค้าขายดี Top 5
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">ยังไม่มียอดขายใน 30 วันที่ผ่านมา</p>
            ) : (
              <div className="space-y-2">
                {top.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">ขาย {p.qty} ชิ้น · ฿{p.revenue.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> สต็อกใกล้หมด / หมด
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">สต็อกเพียงพอทุกรายการ ✅</p>
            ) : (
              <div className="space-y-2">
                {lowStock.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl border border-border/50">
                    {p.stock_quantity <= 0 ? (
                      <PackageX className="h-4 w-4 text-destructive" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    )}
                    <p className="flex-1 text-sm font-medium truncate">{p.name}</p>
                    <Badge variant={p.stock_quantity <= 0 ? "destructive" : "secondary"}>
                      {p.stock_quantity <= 0 ? "หมด" : `เหลือ ${p.stock_quantity}`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            {outOfStock.length > 0 && (
              <p className="text-xs text-destructive mt-3">⚠️ มีสินค้าหมด {outOfStock.length} รายการ - เติมสต็อกด่วน</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> อัตราการตรวจสลิป (30 วัน)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {total === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">ยังไม่มีออเดอร์</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-green-500/10">
                  <p className="text-2xl font-bold text-green-600">{approved}</p>
                  <p className="text-xs text-muted-foreground">อนุมัติ ({pct(approved)}%)</p>
                </div>
                <div className="p-3 rounded-xl bg-yellow-500/10">
                  <p className="text-2xl font-bold text-yellow-600">{needsReview}</p>
                  <p className="text-xs text-muted-foreground">รอตรวจ ({pct(needsReview)}%)</p>
                </div>
                <div className="p-3 rounded-xl bg-destructive/10">
                  <p className="text-2xl font-bold text-destructive">{rejected}</p>
                  <p className="text-xs text-muted-foreground">ปฏิเสธ ({pct(rejected)}%)</p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>อัตราอนุมัติอัตโนมัติ</span>
                  <span className="font-medium text-foreground">{pct(approved)}%</span>
                </div>
                <Progress value={pct(approved)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
