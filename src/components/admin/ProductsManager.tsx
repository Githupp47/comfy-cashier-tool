import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Package, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { downloadStockCsv } from "@/lib/exportStockCsv";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

export function ProductsManager({ products, queryClient }: { products: Product[]; queryClient: any }) {
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
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setDialogOpen(false);
      setEditProduct(null);
      setImageFile(null);
      toast.success("บันทึกสินค้าสำเร็จ — กำลังดาวน์โหลดไฟล์สต็อกอัตโนมัติ");
      // Auto-download fresh stock CSV after save
      const { data: fresh } = await supabase.from("products").select("*").order("sort_order");
      if (fresh) downloadStockCsv(fresh as Product[]);
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
    setEditProduct({ name: "", price: 0, category: "ice_cream", is_available: true, sort_order: 0, stock_quantity: 0 } as any);
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">📦 จัดการสินค้า & สต็อก</h2>
          <p className="text-sm text-muted-foreground">{products.length} รายการ · รวมสต็อก {products.reduce((s, p: any) => s + (p.stock_quantity ?? 0), 0)} ชิ้น</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { downloadStockCsv(products); toast.success("ดาวน์โหลดไฟล์สต็อก CSV แล้ว"); }} variant="outline" className="rounded-xl gap-2">
            <Download className="h-4 w-4" /> CSV สต็อก
          </Button>
          <Button onClick={openNew} className="bg-primary text-primary-foreground rounded-xl gap-2 shadow-sm">
            <Plus className="h-4 w-4" /> เพิ่มสินค้า
          </Button>
        </div>
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-primary font-bold">฿{p.price}</p>
                    <Badge variant={((p as any).stock_quantity ?? 0) <= 5 ? "destructive" : "outline"} className="text-[10px] gap-1">
                      {((p as any).stock_quantity ?? 0) <= 5 && <AlertTriangle className="h-3 w-3" />}
                      สต็อก: {(p as any).stock_quantity ?? 0}
                    </Badge>
                  </div>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label className="text-sm font-medium">📦 จำนวนสต็อก</Label><Input className="rounded-xl" type="number" min={0} value={(editProduct as any).stock_quantity ?? 0} onChange={(e) => setEditProduct({ ...editProduct, stock_quantity: Number(e.target.value) } as any)} /></div>
                <div className="space-y-2"><Label className="text-sm font-medium">ลำดับการแสดง</Label><Input className="rounded-xl" type="number" value={editProduct.sort_order ?? 0} onChange={(e) => setEditProduct({ ...editProduct, sort_order: Number(e.target.value) })} /></div>
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
