import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, LogOut, Plus, Pencil, Trash2, Package, ShoppingBag,
  Settings, Image, BellRing, TrendingUp, Clock, CheckCircle2,
  MapPin, MessageSquare, Eye, EyeOff, Volume2, VolumeX, Store, Send,
  BarChart3
} from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import brandLogo from "@/assets/brand-logo.png";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Product = Tables<"products">;
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

  // Realtime: new orders
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

  // Realtime: new chat messages from customers
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

  // Chart data: orders per day (last 7 days)
  const chartData = (() => {
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="rounded-full hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </Button>
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
            <div className="flex items-center justify-between mb-2"><div className="p-2 rounded-xl bg-primary/10"><TrendingUp className="h-5 w-5 text-primary" /></div><span className="text-xs text-muted-foreground">รายได้</span></div>
            <p className="text-2xl font-bold text-primary">฿{totalRevenue.toLocaleString()}</p>
          </CardContent></Card>
        </div>

        {/* Chart */}
        {chartData.length > 0 && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> ออเดอร์ 7 วันล่าสุด</CardTitle>
            </CardHeader>
            <CardContent className="pr-2">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    formatter={(value: number, name: string) => [name === "revenue" ? `฿${value.toLocaleString()}` : value, name === "revenue" ? "รายได้" : "ออเดอร์"]}
                  />
                  <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

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
            <TabsTrigger value="settings" className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2.5">
              <Settings className="h-4 w-4" /> ตั้งค่า
            </TabsTrigger>
          </TabsList>

          <TabsContent value="orders"><OrdersManager orders={orders ?? []} queryClient={queryClient} /></TabsContent>
          <TabsContent value="chat"><AdminChat /></TabsContent>
          <TabsContent value="products"><ProductsManager products={products ?? []} queryClient={queryClient} /></TabsContent>
          <TabsContent value="settings"><ShopSettings /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ===================== ADMIN CHAT ===================== */
function AdminChat() {
  const [orders, setOrders] = useState<{ id: string; customer_name: string; customer_phone: string }[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("chat_messages").select("order_id").then(({ data }) => {
      if (!data) return;
      const uniqueOrderIds = [...new Set(data.map(d => d.order_id))];
      if (uniqueOrderIds.length === 0) return;
      supabase.from("orders").select("id, customer_name, customer_phone").in("id", uniqueOrderIds).then(({ data: orderData }) => {
        if (orderData) setOrders(orderData);
      });
    });
  }, []);

  useEffect(() => {
    if (!selectedOrder) return;
    const fetch = async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("order_id", selectedOrder).order("created_at");
      if (data) setMessages(data);
      // Mark as read
      await supabase.from("chat_messages").update({ is_read: true }).eq("order_id", selectedOrder).eq("sender_type", "customer");
    };
    fetch();

    const channel = supabase
      .channel(`admin-chat-${selectedOrder}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `order_id=eq.${selectedOrder}` }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedOrder]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedOrder) return;
    await supabase.from("chat_messages").insert({ order_id: selectedOrder, sender_type: "admin", message: newMsg.trim() });
    setNewMsg("");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground">💬 แชทกับลูกค้า</h2>

      <div className="grid md:grid-cols-3 gap-4" style={{ minHeight: 400 }}>
        {/* Order list */}
        <div className="space-y-2 md:border-r md:pr-4 border-border">
          <p className="text-xs text-muted-foreground font-medium">ออเดอร์ที่มีแชท</p>
          {orders.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีแชท</p>}
          {orders.map(o => (
            <button key={o.id} onClick={() => setSelectedOrder(o.id)}
              className={`w-full text-left p-3 rounded-xl text-sm transition-colors ${selectedOrder === o.id ? "bg-primary/10 border border-primary/30" : "bg-muted/50 hover:bg-muted"}`}>
              <p className="font-medium text-foreground">{o.customer_name}</p>
              <p className="text-xs text-muted-foreground">📱 {o.customer_phone} • #{o.id.slice(0, 8)}</p>
            </button>
          ))}
        </div>

        {/* Chat area */}
        <div className="md:col-span-2 flex flex-col bg-muted/20 rounded-xl border border-border overflow-hidden">
          {!selectedOrder ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              <p>← เลือกออเดอร์เพื่อดูแชท</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-80">
                {messages.map((m: any) => (
                  <div key={m.id} className={`flex ${m.sender_type === "admin" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                      m.sender_type === "admin"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-card text-foreground rounded-bl-md border border-border"
                    }`}>
                      {m.message}
                    </div>
                  </div>
                ))}
                {messages.length === 0 && <p className="text-center text-xs text-muted-foreground pt-8">ยังไม่มีข้อความ</p>}
                <div ref={bottomRef} />
              </div>
              <div className="p-3 border-t border-border flex gap-2 bg-card">
                <Input className="rounded-xl flex-1 text-sm" placeholder="พิมพ์ตอบกลับ..." value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
                <Button size="icon" className="rounded-xl shrink-0" onClick={sendMessage}><Send className="h-4 w-4" /></Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== PRODUCTS ===================== */
function ProductsManager({ products, queryClient }: { products: Product[]; queryClient: any }) {
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (product: Partial<Product>) => {
      let image_url = product.image_url;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const fileName = `${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("product-images").upload(fileName, imageFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(fileName);
        image_url = urlData.publicUrl;
      }
      const payload = { ...product, image_url };
      if (product.id) {
        const { error } = await supabase.from("products").update(payload).eq("id", product.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDialogOpen(false);
      setEditProduct(null);
      setImageFile(null);
      toast.success("บันทึกสินค้าสำเร็จ");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("ลบสินค้าสำเร็จ");
    },
  });

  const openNew = () => {
    setEditProduct({ name: "", price: 0, category: "ice_cream", is_available: true, sort_order: 0 });
    setImageFile(null);
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditProduct({ ...p });
    setImageFile(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">📦 จัดการสินค้า</h2>
          <p className="text-sm text-muted-foreground">{products.length} รายการ</p>
        </div>
        <Button onClick={openNew} className="bg-primary text-primary-foreground rounded-xl gap-2 shadow-sm">
          <Plus className="h-4 w-4" /> เพิ่มสินค้า
        </Button>
      </div>

      <div className="grid gap-3">
        {products.map((p) => (
          <Card key={p.id} className="border-border overflow-hidden hover:shadow-md transition-all group">
            <CardContent className="p-0">
              <div className="flex items-center gap-4 p-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted flex-shrink-0 border border-border shadow-sm">
                  {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-2xl bg-muted">{p.category === "ice_cream" ? "🍦" : "🍚"}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground truncate">{p.name}</p>
                    <Badge variant={p.is_available ? "default" : "secondary"} className="text-[10px] shrink-0">{p.is_available ? "✓ พร้อมขาย" : "ปิดขาย"}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{p.category === "ice_cream" ? "🍦 ไอติม" : "🍚 โคจิ"} {p.rice_variety ? `• ${p.rice_variety}` : ""} {p.weight ? `• ${p.weight}` : ""}</p>
                  <p className="text-primary font-bold mt-0.5">฿{p.price}</p>
                </div>
                <div className="flex gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="outline" className="rounded-xl h-9 w-9" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="outline" className="rounded-xl h-9 w-9 text-destructive hover:bg-destructive/10" onClick={() => { if (confirm("ลบสินค้านี้?")) deleteMutation.mutate(p.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {products.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>ยังไม่มีสินค้า</p>
            <Button variant="outline" className="mt-3 rounded-xl" onClick={openNew}>เพิ่มสินค้าแรก</Button>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader><DialogTitle className="text-lg">{editProduct?.id ? "✏️ แก้ไขสินค้า" : "➕ เพิ่มสินค้าใหม่"}</DialogTitle></DialogHeader>
          {editProduct && (
            <div className="space-y-4 pt-2">
              <div className="space-y-2"><Label className="text-sm font-medium">ชื่อสินค้า</Label><Input className="rounded-xl" value={editProduct.name ?? ""} onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })} /></div>
              <div className="space-y-2"><Label className="text-sm font-medium">คำอธิบาย</Label><Textarea className="rounded-xl" value={editProduct.description ?? ""} onChange={(e) => setEditProduct({ ...editProduct, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label className="text-sm font-medium">ราคา (฿)</Label><Input className="rounded-xl" type="number" value={editProduct.price ?? 0} onChange={(e) => setEditProduct({ ...editProduct, price: Number(e.target.value) })} /></div>
                <div className="space-y-2"><Label className="text-sm font-medium">หมวดหมู่</Label>
                  <Select value={editProduct.category ?? "ice_cream"} onValueChange={(v) => setEditProduct({ ...editProduct, category: v })}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ice_cream">🍦 ไอติมข้าว</SelectItem><SelectItem value="koji">🍚 เชื้อโคจิ</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label className="text-sm font-medium">สายพันธุ์ข้าว</Label><Input className="rounded-xl" value={editProduct.rice_variety ?? ""} onChange={(e) => setEditProduct({ ...editProduct, rice_variety: e.target.value })} /></div>
                <div className="space-y-2"><Label className="text-sm font-medium">น้ำหนัก</Label><Input className="rounded-xl" value={editProduct.weight ?? ""} onChange={(e) => setEditProduct({ ...editProduct, weight: e.target.value })} placeholder="เช่น 500g" /></div>
              </div>
              <div className="space-y-2"><Label className="text-sm font-medium">ลำดับการแสดง</Label><Input className="rounded-xl" type="number" value={editProduct.sort_order ?? 0} onChange={(e) => setEditProduct({ ...editProduct, sort_order: Number(e.target.value) })} /></div>
              <div className="space-y-2"><Label className="text-sm font-medium">รูปสินค้า</Label><Input className="rounded-xl" type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />{editProduct.image_url && !imageFile && <img src={editProduct.image_url} alt="" className="h-20 rounded-xl object-cover border border-border" />}</div>
              <div className="flex items-center gap-3 bg-muted/50 rounded-xl p-3"><Switch checked={editProduct.is_available ?? true} onCheckedChange={(v) => setEditProduct({ ...editProduct, is_available: v })} /><Label className="text-sm">สินค้าพร้อมขาย</Label></div>
              <Button className="w-full bg-primary text-primary-foreground rounded-xl h-11 text-base" onClick={() => saveMutation.mutate(editProduct)} disabled={saveMutation.isPending}>{saveMutation.isPending ? "กำลังบันทึก..." : "💾 บันทึก"}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ===================== ORDERS ===================== */
function OrdersManager({ orders, queryClient }: { orders: Order[]; queryClient: any }) {
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
      // Auto-send chat message when order is completed/delivered
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
      // order_items cascade via FK, but let's be safe
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

/* ===================== SETTINGS ===================== */
function ShopSettings() {
  const queryClient = useQueryClient();
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["shop-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shop_settings").select("*");
      if (error) throw error;
      return data as { id: string; key: string; value: string | null }[];
    },
  });

  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) {
      const obj: Record<string, string> = {};
      settings.forEach((s) => { obj[s.key] = s.value ?? ""; });
      setForm(obj);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let logoUrl = form.logo_url;
      if (logoFile) {
        const ext = logoFile.name.split(".").pop();
        const fileName = `logo_${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("product-images").upload(fileName, logoFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(fileName);
        logoUrl = urlData.publicUrl;
      }
      const updates: Record<string, string> = { ...form, logo_url: logoUrl };
      for (const [key, value] of Object.entries(updates)) {
        const { error } = await supabase.from("shop_settings").update({ value }).eq("key", key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-settings"] });
      setLogoFile(null);
      toast.success("บันทึกการตั้งค่าสำเร็จ");
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-lg space-y-6">
      <div><h2 className="text-xl font-bold text-foreground">⚙️ ตั้งค่าร้าน & แบรนด์</h2><p className="text-sm text-muted-foreground">จัดการข้อมูลร้านและโลโก้แบรนด์</p></div>

      <Card className="border-border overflow-hidden">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Image className="h-4 w-4 text-primary" /> โลโก้แบรนด์</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {form.logo_url && !logoFile && (
            <div className="flex items-center gap-4 bg-muted/30 rounded-xl p-4 border border-border/50">
              <img src={form.logo_url} alt="logo" className="h-20 w-20 rounded-xl object-contain bg-card border border-border p-1" />
              <div><p className="text-sm font-medium text-foreground">โลโก้ปัจจุบัน</p><p className="text-xs text-muted-foreground mt-1">จะแสดงใน Navbar, หน้าแรก และ Footer</p></div>
            </div>
          )}
          <div className="space-y-2"><Label className="text-sm">อัพโหลดโลโก้ใหม่</Label><Input className="rounded-xl" type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} /></div>
        </CardContent>
      </Card>

      <Card className="border-border overflow-hidden">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4 text-primary" /> ข้อมูลร้าน</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label className="text-sm font-medium">ชื่อร้าน</Label><Input className="rounded-xl" value={form.shop_name ?? ""} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
          <div className="space-y-2"><Label className="text-sm font-medium">คำโปรย (Tagline)</Label><Input className="rounded-xl" value={form.shop_tagline ?? ""} onChange={(e) => setForm({ ...form, shop_tagline: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label className="text-sm font-medium">เบอร์โทรศัพท์</Label><Input className="rounded-xl" value={form.shop_phone ?? ""} onChange={(e) => setForm({ ...form, shop_phone: e.target.value })} placeholder="0xx-xxx-xxxx" /></div>
            <div className="space-y-2"><Label className="text-sm font-medium">LINE ID</Label><Input className="rounded-xl" value={form.shop_line_id ?? ""} onChange={(e) => setForm({ ...form, shop_line_id: e.target.value })} placeholder="@lineid" /></div>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full bg-primary text-primary-foreground rounded-xl h-12 text-base shadow-sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "กำลังบันทึก..." : "💾 บันทึกการตั้งค่า"}
      </Button>
    </div>
  );
}
