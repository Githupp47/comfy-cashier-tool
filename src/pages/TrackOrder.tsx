import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Search, Clock, CheckCircle2, Package, MapPin, Truck, XCircle,
  Phone, MessageSquare, ArrowLeft
} from "lucide-react";

type OrderWithItems = {
  id: string;
  customer_name: string;
  customer_phone: string;
  status: string;
  total_amount: number;
  note: string | null;
  created_at: string;
  items: { product_name: string; quantity: number; price: number }[];
};

const statusSteps = [
  { key: "pending", label: "รอตรวจสอบ", icon: Clock, description: "ร้านกำลังตรวจสอบสลิปการชำระเงิน" },
  { key: "confirmed", label: "ยืนยันแล้ว", icon: CheckCircle2, description: "ชำระเงินเรียบร้อย กำลังเตรียมสินค้า" },
  { key: "preparing", label: "กำลังเตรียม", icon: Package, description: "ร้านกำลังเตรียมสินค้าของคุณ" },
  { key: "delivering", label: "กำลังจัดส่ง", icon: Truck, description: "สินค้ากำลังเดินทางไปหาคุณ" },
  { key: "completed", label: "เสร็จสิ้น", icon: CheckCircle2, description: "จัดส่งเรียบร้อยแล้ว ขอบคุณค่ะ 💛" },
];

export default function TrackOrder() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<OrderWithItems[] | null>(null);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!phone.trim()) {
      setError("กรุณากรอกเบอร์โทรศัพท์");
      return;
    }
    setLoading(true);
    setError("");
    setOrders(null);

    try {
      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_phone", phone.trim())
        .order("created_at", { ascending: false })
        .limit(10);

      if (orderErr) throw orderErr;
      if (!orderData || orderData.length === 0) {
        setError("ไม่พบออเดอร์จากเบอร์นี้ กรุณาตรวจสอบเบอร์โทรอีกครั้ง");
        setLoading(false);
        return;
      }

      const results: OrderWithItems[] = [];
      for (const order of orderData) {
        const { data: items } = await supabase
          .from("order_items")
          .select("product_name, quantity, price")
          .eq("order_id", order.id);
        results.push({ ...order, items: items ?? [] });
      }

      setOrders(results);
    } catch (err: any) {
      setError("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStepIndex = (status: string) => {
    if (status === "cancelled") return -1;
    return statusSteps.findIndex((s) => s.key === status);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-lg space-y-6">
        <Button variant="ghost" className="gap-2 -ml-2 text-muted-foreground" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" /> กลับหน้าหลัก
        </Button>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">📦 ติดตามสถานะออเดอร์</h1>
          <p className="text-muted-foreground text-sm">กรอกเบอร์โทรที่ใช้สั่งซื้อเพื่อเช็คสถานะ</p>
        </div>

        {/* Search */}
        <Card className="border-border">
          <CardContent className="p-4 space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">เบอร์โทรศัพท์</Label>
              <div className="flex gap-2">
                <Input
                  className="rounded-xl flex-1"
                  placeholder="08x-xxx-xxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button
                  className="bg-primary text-primary-foreground rounded-xl gap-2 px-5"
                  onClick={handleSearch}
                  disabled={loading}
                >
                  <Search className="h-4 w-4" />
                  {loading ? "กำลังค้นหา..." : "ค้นหา"}
                </Button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">{error}</p>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {orders && orders.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">พบ {orders.length} ออเดอร์</p>

            {orders.map((order) => {
              const currentStep = getStepIndex(order.status);
              const isCancelled = order.status === "cancelled";

              return (
                <Card key={order.id} className="border-border overflow-hidden">
                  <CardContent className="p-0">
                    {/* Order header */}
                    <div className="p-4 bg-muted/30 border-b border-border/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-foreground">{order.customer_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(order.created_at).toLocaleString("th-TH")}
                          </p>
                        </div>
                        <p className="text-lg font-bold text-primary">฿{order.total_amount}</p>
                      </div>
                    </div>

                    {/* Status timeline */}
                    <div className="p-4 space-y-1">
                      {isCancelled ? (
                        <div className="flex items-center gap-3 p-3 bg-destructive/10 rounded-xl">
                          <XCircle className="h-6 w-6 text-destructive flex-shrink-0" />
                          <div>
                            <p className="font-medium text-destructive">ออเดอร์ถูกยกเลิก</p>
                            <p className="text-xs text-muted-foreground">กรุณาติดต่อร้านหากมีข้อสงสัย</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-0">
                          {statusSteps.map((step, idx) => {
                            const isActive = idx <= currentStep;
                            const isCurrent = idx === currentStep;
                            const StepIcon = step.icon;
                            return (
                              <div key={step.key} className="flex gap-3">
                                {/* Line + dot */}
                                <div className="flex flex-col items-center">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                                    isCurrent
                                      ? "bg-primary text-primary-foreground shadow-md"
                                      : isActive
                                        ? "bg-primary/20 text-primary"
                                        : "bg-muted text-muted-foreground"
                                  }`}>
                                    <StepIcon className="h-4 w-4" />
                                  </div>
                                  {idx < statusSteps.length - 1 && (
                                    <div className={`w-0.5 h-8 ${isActive && idx < currentStep ? "bg-primary/40" : "bg-border"}`} />
                                  )}
                                </div>
                                {/* Text */}
                                <div className={`pb-4 ${isCurrent ? "" : "opacity-60"}`}>
                                  <p className={`text-sm font-medium ${isCurrent ? "text-primary" : "text-foreground"}`}>
                                    {step.label}
                                    {isCurrent && <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">ปัจจุบัน</span>}
                                  </p>
                                  {isCurrent && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Order items */}
                    {order.items.length > 0 && (
                      <>
                        <Separator />
                        <div className="p-4 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">รายการสินค้า</p>
                          {order.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span className="text-foreground">{item.product_name} <span className="text-muted-foreground">x{item.quantity}</span></span>
                              <span className="font-medium text-primary">฿{item.price * item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
