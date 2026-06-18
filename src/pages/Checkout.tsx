import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCart } from "@/contexts/CartContext";
import { Trash2, ShoppingBag, CreditCard, Upload, Copy, Check, Sparkles, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import qrFallback from "@/assets/qr-payment.jpg";

type Topping = { id: string; name: string; price: number; stock_quantity: number; is_available: boolean };

export default function Checkout() {
  const navigate = useNavigate();
  const { items, updateQuantity, removeFromCart, totalAmount, clearCart } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [mapLink, setMapLink] = useState("");
  const [note, setNote] = useState("");
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toppingQty, setToppingQty] = useState<Record<string, number>>({});

  const { data: toppings = [] } = useQuery({
    queryKey: ["toppings"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("toppings")
        .select("*").eq("is_available", true).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Topping[];
    },
  });

  const selectedToppings = useMemo(
    () => toppings.filter((t) => (toppingQty[t.id] ?? 0) > 0)
      .map((t) => ({ id: t.id, name: t.name, price: Number(t.price), quantity: toppingQty[t.id] })),
    [toppings, toppingQty]
  );
  const toppingTotal = selectedToppings.reduce((s, t) => s + t.price * t.quantity, 0);
  const grandTotal = totalAmount + toppingTotal;

  const { data: settings } = useQuery({
    queryKey: ["shop-settings-checkout"],
    queryFn: async () => {
      const { data } = await supabase.from("shop_settings").select("*");
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: any) => (map[s.key] = s.value ?? ""));
      return map;
    },
  });

  const qrUrl = settings?.payment_qr_url || qrFallback;
  const bankName = settings?.payment_bank_name || "SCB (ไทยพาณิชย์)";
  const bankAccount = settings?.payment_bank_account || "4230504802";

  const copyAccount = () => {
    navigator.clipboard.writeText(bankAccount);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("คัดลอกเลขบัญชีแล้ว");
  };

  const handleSubmit = async () => {
    if (items.length === 0) return toast.error("ตะกร้าว่างเปล่า");
    if (!name.trim() || !phone.trim()) return toast.error("กรุณากรอกชื่อและเบอร์โทร");
    if (!slipFile) return toast.error("กรุณาแนบสลิปการโอนเงิน");

    setSubmitting(true);
    try {
      // Upload slip
      const ext = slipFile.name.split(".").pop();
      const fileName = `slip_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("slips").upload(fileName, slipFile);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("slips").getPublicUrl(fileName);

      // Create order
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          dormitory_map_link: mapLink.trim() || null,
          note: note.trim() || null,
          slip_url: urlData.publicUrl,
          total_amount: grandTotal,
          status: "pending",
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      // Create order items (one row per product)
      const orderItems: any[] = items.map((i) => ({
        order_id: order.id,
        product_id: i.product.id,
        product_name: i.product.name,
        price: Number(i.product.price),
        quantity: i.quantity,
        toppings: [],
      }));
      // Append a single order_item carrying the toppings (so trigger decrements stock)
      if (selectedToppings.length > 0) {
        orderItems.push({
          order_id: order.id,
          product_id: null,
          product_name: "ท็อปปิ้ง: " + selectedToppings.map((t) => `${t.name} x${t.quantity}`).join(", "),
          price: toppingTotal,
          quantity: 1,
          toppings: selectedToppings,
        });
      }
      const { error: itemsErr } = await supabase.from("order_items").insert(orderItems);
      if (itemsErr) throw itemsErr;

      clearCart();
      toast.success("สั่งซื้อสำเร็จ! 🎉");
      navigate(`/track?phone=${encodeURIComponent(phone.trim())}`);
    } catch (err: any) {
      toast.error("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <Navbar />
      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShoppingBag className="h-6 w-6 text-primary" /> ตะกร้าสินค้า
        </h1>

        {items.length === 0 ? (
          <Card className="border-border">
            <CardContent className="py-12 text-center text-muted-foreground">
              <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>ตะกร้าว่างเปล่า</p>
              <Button className="mt-4 rounded-xl" onClick={() => navigate("/")}>
                เลือกซื้อสินค้า
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Items */}
            <Card className="border-border">
              <CardContent className="p-3 space-y-2">
                {items.map((i) => (
                  <div key={i.product.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50">
                    {i.product.image_url && (
                      <img src={i.product.image_url} alt={i.product.name} className="h-14 w-14 rounded-lg object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{i.product.name}</p>
                      <p className="text-xs text-muted-foreground">฿{Number(i.product.price).toLocaleString()} × {i.quantity}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => updateQuantity(i.product.id, i.quantity - 1)}>−</Button>
                      <span className="text-sm font-bold w-6 text-center">{i.quantity}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" onClick={() => updateQuantity(i.product.id, i.quantity + 1)}>+</Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(i.product.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="border-t border-border pt-3 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">สินค้า</span>
                    <span className="font-medium">฿{totalAmount.toLocaleString()}</span>
                  </div>
                  {toppingTotal > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">ท็อปปิ้ง</span>
                      <span className="font-medium">฿{toppingTotal.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm text-muted-foreground">ยอดรวมทั้งหมด</span>
                    <span className="text-2xl font-bold text-primary">฿{grandTotal.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Toppings */}
            {toppings.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> เพิ่มท็อปปิ้ง
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {toppings.map((t) => {
                    const qty = toppingQty[t.id] ?? 0;
                    const outOfStock = t.stock_quantity <= 0;
                    return (
                      <div key={t.id} className={`flex items-center gap-3 p-2 rounded-xl ${outOfStock ? "opacity-50" : "hover:bg-muted/40"}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground">+฿{Number(t.price).toLocaleString()} {outOfStock && "· หมด"}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" disabled={qty === 0}
                            onClick={() => setToppingQty((p) => ({ ...p, [t.id]: Math.max(0, qty - 1) }))}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-bold w-6 text-center">{qty}</span>
                          <Button size="icon" variant="outline" className="h-7 w-7 rounded-full" disabled={outOfStock || qty >= t.stock_quantity}
                            onClick={() => setToppingQty((p) => ({ ...p, [t.id]: qty + 1 }))}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Customer info */}
            <Card className="border-border">
              <CardHeader className="pb-3"><CardTitle className="text-base">📋 ข้อมูลผู้สั่ง</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">ชื่อ-นามสกุล *</Label>
                  <Input className="rounded-xl" value={name} onChange={(e) => setName(e.target.value)} placeholder="สมชาย ใจดี" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">เบอร์โทรศัพท์ *</Label>
                  <Input className="rounded-xl" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0xx-xxx-xxxx" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">ลิงก์แผนที่หอพัก / ที่อยู่ส่ง</Label>
                  <Input className="rounded-xl" value={mapLink} onChange={(e) => setMapLink(e.target.value)} placeholder="https://maps.google.com/..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">หมายเหตุ</Label>
                  <Textarea className="rounded-xl" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ระบุเพิ่มเติม..." rows={2} />
                </div>
              </CardContent>
            </Card>

            {/* Payment */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary" /> ชำระเงิน
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/30 rounded-xl p-4 border border-border/50 text-center">
                  <p className="text-xs text-muted-foreground mb-2">สแกน QR Code เพื่อชำระเงิน</p>
                  <img src={qrUrl} alt="QR Code" className="h-48 mx-auto rounded-lg object-contain bg-card" />
                  <p className="text-2xl font-bold text-primary mt-3">฿{grandTotal.toLocaleString()}</p>
                </div>
                <div className="bg-accent/30 rounded-xl p-3 space-y-1 text-sm">
                  <p className="text-muted-foreground text-xs">หรือโอนเข้าบัญชี</p>
                  <p className="font-medium text-foreground">{bankName}</p>
                  <button onClick={copyAccount} className="flex items-center gap-2 text-primary hover:underline">
                    <span className="font-mono font-bold">{bankAccount}</span>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">แนบสลิปการโอน *</Label>
                  <div className="relative">
                    <Input className="rounded-xl" type="file" accept="image/*" onChange={(e) => setSlipFile(e.target.files?.[0] ?? null)} />
                  </div>
                  {slipFile && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Upload className="h-3 w-3" /> {slipFile.name}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Button
              className="w-full h-12 rounded-xl text-base bg-primary text-primary-foreground"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "กำลังส่งคำสั่งซื้อ..." : `✨ ยืนยันสั่งซื้อ ฿${grandTotal.toLocaleString()}`}
            </Button>
          </>
        )}
      </main>
    </div>
  );
}
