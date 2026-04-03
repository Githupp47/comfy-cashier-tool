import { useEffect, useState } from "react";
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
import { ArrowLeft, LogOut, Plus, Pencil, Trash2, Package, ShoppingBag, Settings, Image, Bell } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;
type Order = Tables<"orders">;

export default function Admin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orderCount, setOrderCount] = useState<number | null>(null);

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

  // Sound notification for new orders via realtime
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("admin-new-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        () => {
          const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp2XjHhjaGJ3ipeanJeIc2Bla3yLmJqVh3JfZGt8jJiZlIZwXmVsfY6ZmpWHcF5la32NmJmUhnBeZWx9jpiZlIZwXmRsfI6YmZSGcF5la32OmJmUhnBeZGx8jpiZlYdxX2VsfY6YmZSGcF5lbH2OmJmUhnBeZWt9jpiZlIZwXmVrfY6YmpWHcV9lbH2OmJmVh3FfZWx9jpiZlIZwXmVsfY6YmZSGcF5la32OmJmUhnBeZWx9jpiZlIZwXmVrfY6YmpWHcV9lbH2OmJmUh3FfZWx9jpiZlIZwXmVrfY+YmpWHcV9la32OmJqVh3FfZWx9jpiZlIdxX2VsfY6YmZWHcV9lbH2OmJmUhnBeZWx9jpiZlIZwXmVsfY6YmpWHcV9la32OmJmVh3FfZWx9jpiZlIZw");
          audio.volume = 0.7;
          audio.play().catch(() => {});
          toast.success("🔔 มีออเดอร์ใหม่เข้ามา!", { duration: 5000 });
          queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, queryClient]);

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
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
  if (!session) return null;

  const pendingOrders = orders?.filter(o => o.status === "pending").length ?? 0;
  const todayOrders = orders?.filter(o => {
    const today = new Date().toDateString();
    return new Date(o.created_at).toDateString() === today;
  }).length ?? 0;
  const totalRevenue = orders?.filter(o => o.status !== "cancelled").reduce((sum, o) => sum + Number(o.total_amount), 0) ?? 0;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="border-b border-border bg-card shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-foreground">แดชบอร์ดแอดมิน</h1>
              <p className="text-xs text-muted-foreground">จัดการร้านข้าวไอติม & เชื้อโคจิ</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="rounded-full gap-2">
            <LogOut className="h-4 w-4" /> ออกจากระบบ
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-border">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{products?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">สินค้าทั้งหมด</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-100">
                  <ShoppingBag className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{pendingOrders}</p>
                  <p className="text-xs text-muted-foreground">รอตรวจสอบ</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100">
                  <ShoppingBag className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{todayOrders}</p>
                  <p className="text-xs text-muted-foreground">ออเดอร์วันนี้</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary">฿{totalRevenue.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">ยอดรวม</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="products">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="products" className="gap-1.5">
              <Package className="h-4 w-4" /> สินค้า
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5">
              <ShoppingBag className="h-4 w-4" /> ออเดอร์
              {pendingOrders > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 rounded-full p-0 flex items-center justify-center text-xs ml-1">
                  {pendingOrders}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5">
              <Settings className="h-4 w-4" /> ตั้งค่า
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="mt-6">
            <ProductsManager products={products ?? []} queryClient={queryClient} />
          </TabsContent>
          <TabsContent value="orders" className="mt-6">
            <OrdersManager orders={orders ?? []} queryClient={queryClient} />
          </TabsContent>
          <TabsContent value="settings" className="mt-6">
            <ShopSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

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
        <h2 className="text-lg font-semibold text-foreground">รายการสินค้า ({products.length})</h2>
        <Button onClick={openNew} className="bg-primary text-primary-foreground rounded-full gap-1.5">
          <Plus className="h-4 w-4" /> เพิ่มสินค้า
        </Button>
      </div>

      <div className="grid gap-3">
        {products.map((p) => (
          <Card key={p.id} className="border-border overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center gap-4 p-4">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 border border-border">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl bg-muted">
                      {p.category === "ice_cream" ? "🍦" : "🍚"}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground truncate">{p.name}</p>
                    <Badge variant={p.is_available ? "default" : "secondary"} className="text-xs shrink-0">
                      {p.is_available ? "พร้อมขาย" : "ปิดขาย"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {p.category === "ice_cream" ? "🍦 ไอติม" : "🍚 โคจิ"} • {p.rice_variety ?? ""} • <span className="text-primary font-semibold">฿{p.price}</span>
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="icon" variant="outline" className="rounded-full h-9 w-9" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" className="rounded-full h-9 w-9 text-destructive hover:bg-destructive/10" onClick={() => { if (confirm("ลบสินค้านี้?")) deleteMutation.mutate(p.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProduct?.id ? "แก้ไขสินค้า" : "เพิ่มสินค้าใหม่"}</DialogTitle>
          </DialogHeader>
          {editProduct && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>ชื่อสินค้า</Label>
                <Input value={editProduct.name ?? ""} onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>คำอธิบาย</Label>
                <Textarea value={editProduct.description ?? ""} onChange={(e) => setEditProduct({ ...editProduct, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>ราคา (฿)</Label>
                  <Input type="number" value={editProduct.price ?? 0} onChange={(e) => setEditProduct({ ...editProduct, price: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>หมวดหมู่</Label>
                  <Select value={editProduct.category ?? "ice_cream"} onValueChange={(v) => setEditProduct({ ...editProduct, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ice_cream">🍦 ไอติมข้าว</SelectItem>
                      <SelectItem value="koji">🍚 เชื้อโคจิ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>สายพันธุ์ข้าว</Label>
                  <Input value={editProduct.rice_variety ?? ""} onChange={(e) => setEditProduct({ ...editProduct, rice_variety: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>น้ำหนัก</Label>
                  <Input value={editProduct.weight ?? ""} onChange={(e) => setEditProduct({ ...editProduct, weight: e.target.value })} placeholder="เช่น 500g" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>ลำดับการแสดง</Label>
                <Input type="number" value={editProduct.sort_order ?? 0} onChange={(e) => setEditProduct({ ...editProduct, sort_order: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>รูปสินค้า</Label>
                <Input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
                {editProduct.image_url && !imageFile && (
                  <img src={editProduct.image_url} alt="" className="h-20 rounded-md object-cover" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editProduct.is_available ?? true} onCheckedChange={(v) => setEditProduct({ ...editProduct, is_available: v })} />
                <Label>พร้อมขาย</Label>
              </div>
              <Button
                className="w-full bg-primary text-primary-foreground"
                onClick={() => saveMutation.mutate(editProduct)}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? "กำลังบันทึก..." : "💾 บันทึก"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrdersManager({ orders, queryClient }: { orders: Order[]; queryClient: any }) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("อัพเดตสถานะสำเร็จ");
    },
  });

  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "⏳ รอตรวจสอบ", variant: "outline" },
    confirmed: { label: "✅ ยืนยันแล้ว", variant: "default" },
    preparing: { label: "👨‍🍳 กำลังเตรียม", variant: "secondary" },
    delivering: { label: "🚗 กำลังจัดส่ง", variant: "secondary" },
    completed: { label: "✅ เสร็จสิ้น", variant: "default" },
    cancelled: { label: "❌ ยกเลิก", variant: "destructive" },
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">ออเดอร์ ({orders.length})</h2>

      <div className="grid gap-3">
        {orders.map((o) => (
          <Card key={o.id} className="border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-foreground">{o.customer_name}</p>
                  <p className="text-sm text-muted-foreground">{o.customer_phone}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{new Date(o.created_at).toLocaleString("th-TH")}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-lg font-bold text-primary">฿{o.total_amount}</p>
                  <Badge variant={statusConfig[o.status]?.variant ?? "outline"}>
                    {statusConfig[o.status]?.label ?? o.status}
                  </Badge>
                </div>
              </div>

              {o.dormitory_map_link && (
                <a href={o.dormitory_map_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  📍 ดูที่อยู่หอพัก
                </a>
              )}
              {o.note && <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">💬 {o.note}</p>}
              {o.slip_url && (
                <a href={o.slip_url} target="_blank" rel="noopener noreferrer">
                  <img src={o.slip_url} alt="สลิป" className="h-28 rounded-lg object-cover border border-border shadow-sm" />
                </a>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Select value={o.status} onValueChange={(v) => updateStatus.mutate({ id: o.id, status: v })}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">⏳ รอตรวจสอบ</SelectItem>
                    <SelectItem value="confirmed">✅ ยืนยันแล้ว</SelectItem>
                    <SelectItem value="preparing">👨‍🍳 กำลังเตรียม</SelectItem>
                    <SelectItem value="delivering">🚗 กำลังจัดส่ง</SelectItem>
                    <SelectItem value="completed">✅ เสร็จสิ้น</SelectItem>
                    <SelectItem value="cancelled">❌ ยกเลิก</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => setSelectedOrder(selectedOrder?.id === o.id ? null : o)}>
                  {selectedOrder?.id === o.id ? "ซ่อนรายการ" : "ดูรายการ"}
                </Button>
              </div>

              {selectedOrder?.id === o.id && orderItems && (
                <div className="mt-2 pl-4 border-l-2 border-primary/30 space-y-1">
                  {orderItems.map((item) => (
                    <p key={item.id} className="text-sm text-foreground">
                      {item.product_name} x{item.quantity} — <span className="text-primary">฿{item.price * item.quantity}</span>
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {orders.length === 0 && <p className="text-center text-muted-foreground py-8">ยังไม่มีออเดอร์</p>}
      </div>
    </div>
  );
}

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
      <h2 className="text-lg font-semibold text-foreground">ตั้งค่าร้าน & แบรนด์</h2>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="h-4 w-4" /> โลโก้แบรนด์
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {form.logo_url && !logoFile && (
            <div className="flex items-center gap-4">
              <img src={form.logo_url} alt="logo" className="h-20 rounded-xl object-contain border border-border p-1 bg-muted" />
              <p className="text-sm text-muted-foreground">โลโก้ปัจจุบัน — จะแสดงบน Navbar, หน้าแรก และ Footer</p>
            </div>
          )}
          <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" /> ข้อมูลร้าน
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>ชื่อร้าน</Label>
            <Input value={form.shop_name ?? ""} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>คำโปรย (Tagline)</Label>
            <Input value={form.shop_tagline ?? ""} onChange={(e) => setForm({ ...form, shop_tagline: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>เบอร์โทรศัพท์</Label>
            <Input value={form.shop_phone ?? ""} onChange={(e) => setForm({ ...form, shop_phone: e.target.value })} placeholder="0xx-xxx-xxxx" />
          </div>
          <div className="space-y-2">
            <Label>LINE ID</Label>
            <Input value={form.shop_line_id ?? ""} onChange={(e) => setForm({ ...form, shop_line_id: e.target.value })} placeholder="@lineid" />
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full bg-primary text-primary-foreground"
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? "กำลังบันทึก..." : "💾 บันทึกการตั้งค่า"}
      </Button>
    </div>
  );
}
