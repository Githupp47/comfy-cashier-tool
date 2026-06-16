import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LogOut, Package, ShoppingBag,
  Settings, BellRing, TrendingUp, Clock,
  MessageSquare, Volume2, VolumeX,
  BarChart3, CalendarDays, Bot, Plug
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import brandLogo from "@/assets/brand-logo.png";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend } from "recharts";

import { AdminChat } from "@/components/admin/AdminChat";
import { ProductsManager } from "@/components/admin/ProductsManager";
import { OrdersManager } from "@/components/admin/OrdersManager";
import { ShopSettings } from "@/components/admin/ShopSettings";
import { BotSettings } from "@/components/admin/BotSettings";
import { MessagingIntegrations } from "@/components/admin/MessagingIntegrations";

type Order = Tables<"orders">;

export default function Admin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio("/notification.wav");
    audioRef.current.volume = 0.8;
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
      if (!session) navigate("/admin/login");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (!session) navigate("/admin/login");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("admin-new-orders")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => {
        if (soundEnabled && audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
        toast("🔔 ออเดอร์ใหม่เข้ามาแล้ว!", { description: "กดที่แท็บออเดอร์เพื่อตรวจสอบ", duration: 8000 });
        queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, queryClient, soundEnabled]);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("admin-chat-notify")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload: any) => {
        if (payload.new?.sender_type === "customer") {
          if (soundEnabled && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          }
          toast("💬 มีข้อความใหม่จากลูกค้า!", { duration: 5000 });
          queryClient.invalidateQueries({ queryKey: ["admin-chats"] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, queryClient, soundEnabled]);

  // Stock alert notifications
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("admin-stock-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stock_alerts" }, (payload: any) => {
        const a = payload.new;
        if (soundEnabled && audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
        if (a.alert_type === "out") {
          toast.error(`⚠️ สินค้าหมด: ${a.product_name}`, { duration: 10000, description: "กรุณาเติมสต็อกด่วน" });
        } else {
          toast.warning(`📉 สต็อกใกล้หมด: ${a.product_name} (เหลือ ${a.stock_quantity})`, { duration: 8000 });
        }
        queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, queryClient, soundEnabled]);

  const { data: products } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  const { data: orders } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin/login");
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
  if (!session) return null;

  const pendingOrders = orders?.filter(o => o.status === "pending").length ?? 0;
  const todayOrders = orders?.filter(o => {
    const today = new Date().toDateString();
    return new Date(o.created_at).toDateString() === today;
  }).length ?? 0;
  const totalRevenue = orders?.filter(o => o.status !== "cancelled").reduce((sum, o) => sum + Number(o.total_amount), 0) ?? 0;

  const dailyChartData = (() => {
    if (!orders) return [];
    const days: Record<string, { date: string; orders: number; revenue: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
      days[key] = { date: label, orders: 0, revenue: 0 };
    }
    orders.forEach((o) => {
      const key = new Date(o.created_at).toISOString().slice(0, 10);
      if (days[key]) {
        days[key].orders++;
        if (o.status !== "cancelled") days[key].revenue += Number(o.total_amount);
      }
    });
    return Object.values(days);
  })();

  const monthlyChartData = (() => {
    if (!orders) return [];
    const months: Record<string, { month: string; orders: number; revenue: number }> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" });
      months[key] = { month: label, orders: 0, revenue: 0 };
    }
    orders.forEach((o) => {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (months[key]) {
        months[key].orders++;
        if (o.status !== "cancelled") months[key].revenue += Number(o.total_amount);
      }
    });
    return Object.values(months);
  })();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={brandLogo} alt="HAKKŌ" className="h-10 w-10 rounded-lg object-cover" />
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">HAKKŌ Admin</h1>
              <p className="text-xs text-muted-foreground">ระบบจัดการร้าน</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setSoundEnabled(!soundEnabled)} title={soundEnabled ? "ปิดเสียง" : "เปิดเสียง"}>
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
            </Button>
            {pendingOrders > 0 && (
              <div className="relative">
                <BellRing className="h-5 w-5 text-primary animate-pulse" />
                <span className="absolute -top-1 -right-1 h-4 min-w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center px-1">{pendingOrders}</span>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full gap-2 ml-2">
              <LogOut className="h-4 w-4" /> ออก
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card border-border"><CardContent className="p-4">
            <div className="flex items-center justify-between mb-2"><div className="p-2 rounded-xl bg-primary/10"><Package className="h-5 w-5 text-primary" /></div><span className="text-xs text-muted-foreground">สินค้า</span></div>
            <p className="text-3xl font-bold text-foreground">{products?.length ?? 0}</p>
          </CardContent></Card>
          <Card className="bg-card border-border"><CardContent className="p-4">
            <div className="flex items-center justify-between mb-2"><div className="p-2 rounded-xl bg-accent"><Clock className="h-5 w-5 text-accent-foreground" /></div><span className="text-xs text-muted-foreground">รอดำเนินการ</span></div>
            <p className="text-3xl font-bold text-foreground">{pendingOrders}</p>
          </CardContent></Card>
          <Card className="bg-card border-border"><CardContent className="p-4">
            <div className="flex items-center justify-between mb-2"><div className="p-2 rounded-xl bg-primary/10"><ShoppingBag className="h-5 w-5 text-primary" /></div><span className="text-xs text-muted-foreground">วันนี้</span></div>
            <p className="text-3xl font-bold text-foreground">{todayOrders}</p>
          </CardContent></Card>
          <Card className="bg-card border-border"><CardContent className="p-4">
            <div className="flex items-center justify-between mb-2"><div className="p-2 rounded-xl bg-primary/10"><TrendingUp className="h-5 w-5 text-primary" /></div><span className="text-xs text-muted-foreground">รายได้รวม</span></div>
            <p className="text-2xl font-bold text-primary">฿{totalRevenue.toLocaleString()}</p>
          </CardContent></Card>
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-4">
          {dailyChartData.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> ยอดขาย 7 วันล่าสุด</CardTitle>
              </CardHeader>
              <CardContent className="pr-2">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }}
                      formatter={(value: number, name: string) => [name === "revenue" ? `฿${value.toLocaleString()}` : value, name === "revenue" ? "รายได้" : "ออเดอร์"]}
                    />
                    <Legend formatter={(v) => v === "revenue" ? "รายได้" : "ออเดอร์"} />
                    <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="revenue" fill="hsl(var(--accent-foreground))" radius={[6, 6, 0, 0]} opacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {monthlyChartData.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> ยอดขายรายเดือน (6 เดือน)</CardTitle>
              </CardHeader>
              <CardContent className="pr-2">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 12 }}
                      formatter={(value: number, name: string) => [name === "revenue" ? `฿${value.toLocaleString()}` : value, name === "revenue" ? "รายได้" : "ออเดอร์"]}
                    />
                    <Legend formatter={(v) => v === "revenue" ? "รายได้" : "ออเดอร์"} />
                    <Line type="monotone" dataKey="orders" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--accent-foreground))" strokeWidth={2} dot={{ r: 4 }} opacity={0.7} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="orders" className="space-y-6">
          <TabsList className="bg-card border border-border p-1 h-auto rounded-xl flex-wrap">
            <TabsTrigger value="orders" className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2.5">
              <ShoppingBag className="h-4 w-4" /> ออเดอร์
              {pendingOrders > 0 && <Badge variant="destructive" className="h-5 min-w-5 rounded-full p-0 flex items-center justify-center text-[10px]">{pendingOrders}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2.5">
              <MessageSquare className="h-4 w-4" /> แชท
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2.5">
              <Package className="h-4 w-4" /> สินค้า
            </TabsTrigger>
            <TabsTrigger value="bot" className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2.5">
              <Bot className="h-4 w-4" /> บอท
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2.5">
              <Plug className="h-4 w-4" /> เชื่อมต่อ
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2.5">
              <Settings className="h-4 w-4" /> ตั้งค่า
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders"><OrdersManager orders={orders ?? []} queryClient={queryClient} /></TabsContent>
          <TabsContent value="chat"><AdminChat /></TabsContent>
          <TabsContent value="products"><ProductsManager products={products ?? []} queryClient={queryClient} /></TabsContent>
          <TabsContent value="bot"><BotSettings /></TabsContent>
          <TabsContent value="integrations"><MessagingIntegrations /></TabsContent>
          <TabsContent value="settings"><ShopSettings /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
