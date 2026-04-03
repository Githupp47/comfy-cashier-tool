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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, LogOut, Plus, Pencil, Trash2, Settings, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;
type Order = Tables<"orders">;

export default function Admin() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="min-h-screen flex items-center justify-center">กำลังโหลด...</div>;
  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">จัดการร้าน</h1>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" /> ออกจากระบบ
        </Button>
      </header>

      <div className="container mx-auto px-4 py-6">
        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">สินค้า</TabsTrigger>
            <TabsTrigger value="orders">ออเดอร์</TabsTrigger>
            <TabsTrigger value="settings">⚙️ ตั้งค่าร้าน</TabsTrigger>
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
        <Button onClick={openNew} className="bg-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-1" /> เพิ่มสินค้า
        </Button>
      </div>

      <div className="space-y-3">
        {products.map((p) => (
          <div key={p.id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card">
            <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl">
                  {p.category === "ice_cream" ? "🍦" : "🍚"}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground">{p.name}</p>
              <p className="text-sm text-muted-foreground">
                {p.category === "ice_cream" ? "🍦 ไอติม" : "🍚 โคจิ"} • {p.rice_variety ?? ""} • ฿{p.price}
              </p>
            </div>
            <Button size="icon" variant="outline" onClick={() => openEdit(p)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => { if (confirm("ลบสินค้านี้?")) deleteMutation.mutate(p.id); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
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

  const statusLabels: Record<string, string> = {
    pending: "⏳ รอตรวจสอบ",
    confirmed: "✅ ยืนยันแล้ว",
    preparing: "👨‍🍳 กำลังเตรียม",
    delivering: "🚗 กำลังจัดส่ง",
    completed: "✅ เสร็จสิ้น",
    cancelled: "❌ ยกเลิก",
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">ออเดอร์ ({orders.length})</h2>

      <div className="space-y-3">
        {orders.map((o) => (
          <div key={o.id} className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{o.customer_name}</p>
                <p className="text-sm text-muted-foreground">{o.customer_phone}</p>
                <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("th-TH")}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">฿{o.total_amount}</p>
                <p className="text-xs">{statusLabels[o.status] ?? o.status}</p>
              </div>
            </div>
            {o.dormitory_map_link && (
              <a href={o.dormitory_map_link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
                📍 ดูที่อยู่หอพัก
              </a>
            )}
            {o.note && <p className="text-sm text-muted-foreground">💬 {o.note}</p>}
            {o.slip_url && (
              <a href={o.slip_url} target="_blank" rel="noopener noreferrer">
                <img src={o.slip_url} alt="สลิป" className="h-24 rounded-md object-cover border border-border" />
              </a>
            )}
            <div className="flex items-center gap-2 flex-wrap">
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
              <Button variant="outline" size="sm" onClick={() => setSelectedOrder(selectedOrder?.id === o.id ? null : o)}>
                ดูรายการ
              </Button>
            </div>
            {selectedOrder?.id === o.id && orderItems && (
              <div className="mt-2 pl-4 border-l-2 border-primary/30 space-y-1">
                {orderItems.map((item) => (
                  <p key={item.id} className="text-sm text-foreground">
                    {item.product_name} x{item.quantity} — ฿{item.price * item.quantity}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
        {orders.length === 0 && <p className="text-center text-muted-foreground py-8">ยังไม่มีออเดอร์</p>}
      </div>
    </div>
  );
}
