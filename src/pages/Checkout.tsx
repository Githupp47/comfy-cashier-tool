import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Minus, Plus, Trash2, Upload, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import qrPayment from "@/assets/qr-payment.jpg";

export default function Checkout() {
  const { items, updateQuantity, removeItem, clearCart, total } = useCart();
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [dormitoryMapLink, setDormitoryMapLink] = useState("");
  const [note, setNote] = useState("");
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);

  const handleSlipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSlipFile(file);
      setSlipPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (items.length === 0) {
      toast.error("กรุณาเพิ่มสินค้าก่อนสั่งซื้อ");
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error("กรุณากรอกชื่อและเบอร์โทรศัพท์");
      return;
    }
    if (!slipFile) {
      toast.error("กรุณาอัพโหลดสลิปการโอนเงิน");
      return;
    }

    setSubmitting(true);
    try {
      // Upload slip
      const ext = slipFile.name.split(".").pop();
      const fileName = `${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("slips")
        .upload(fileName, slipFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("slips")
        .getPublicUrl(fileName);

      // Create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_name: customerName,
          customer_phone: customerPhone,
          dormitory_map_link: dormitoryMapLink || null,
          note: note || null,
          total_amount: total,
          slip_url: urlData.publicUrl,
        })
        .select()
        .single();
      if (orderError) throw orderError;

      // Create order items
      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        price: item.product.price,
      }));
      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(orderItems);
      if (itemsError) throw itemsError;

      clearCart();
      setOrderSuccess(true);
      toast.success("สั่งซื้อสำเร็จ! ร้านจะตรวจสอบและติดต่อกลับ");
    } catch (err: any) {
      toast.error("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-20 text-center space-y-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h2 className="text-2xl font-bold text-foreground">สั่งซื้อสำเร็จ!</h2>
          <p className="text-muted-foreground">ร้านจะตรวจสอบสลิปและติดต่อกลับทางเบอร์โทรที่ให้ไว้</p>
          <Button onClick={() => navigate("/")} className="bg-primary text-primary-foreground">
            กลับหน้าหลัก
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-8">
        <h1 className="text-2xl font-bold text-foreground">🛒 สั่งซื้อสินค้า</h1>

        {/* Cart Items */}
        {items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>ตะกร้าว่าง</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>
              กลับไปเลือกสินค้า
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.product.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                  <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                    {item.product.image_url ? (
                      <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">
                        {item.product.category === "ice_cream" ? "🍦" : "🍚"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{item.product.name}</p>
                    <p className="text-sm text-primary">฿{item.product.price}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeItem(item.product.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="text-right text-xl font-bold text-foreground">
              รวม: <span className="text-primary">฿{total}</span>
            </div>

            {/* Customer Info */}
            <div className="space-y-4 border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-foreground">📋 ข้อมูลผู้สั่ง</h2>
              <div className="space-y-2">
                <Label htmlFor="name">ชื่อ *</Label>
                <Input id="name" placeholder="ชื่อ-นามสกุล" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">เบอร์โทรศัพท์ *</Label>
                <Input id="phone" placeholder="08x-xxx-xxxx" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="map">ลิงก์ Google Maps หอพัก</Label>
                <Input id="map" placeholder="วางลิงก์ Google Maps ที่อยู่หอพัก" value={dormitoryMapLink} onChange={(e) => setDormitoryMapLink(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="note">หมายเหตุ</Label>
                <Textarea id="note" placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>

            {/* Payment */}
            <div className="space-y-4 border-t border-border pt-6">
              <h2 className="text-lg font-semibold text-foreground">💳 ชำระเงิน</h2>
              <div className="bg-card border border-border rounded-xl p-6 text-center space-y-4">
                <p className="text-sm text-muted-foreground">สแกน QR Code หรือโอนเงินผ่าน PromptPay</p>
                <img src={qrPayment} alt="QR Payment SCB PromptPay" className="mx-auto max-w-[280px] rounded-lg shadow-md" />
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">หรือโอนเข้าบัญชี SCB</p>
                  <p className="text-lg font-mono font-bold text-foreground">4230504802</p>
                </div>
                <p className="text-lg font-bold text-primary">ยอดที่ต้องชำระ: ฿{total}</p>
              </div>

              {/* Slip Upload */}
              <div className="space-y-2">
                <Label>อัพโหลดสลิปการโอนเงิน *</Label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                  {slipPreview ? (
                    <img src={slipPreview} alt="สลิป" className="h-full py-2 object-contain" />
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <Upload className="h-8 w-8 mb-2" />
                      <span className="text-sm">คลิกเพื่ออัพโหลดสลิป</span>
                    </div>
                  )}
                  <input type="file" className="hidden" accept="image/*" onChange={handleSlipChange} />
                </label>
              </div>
            </div>

            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-lg py-6"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "กำลังส่งคำสั่งซื้อ..." : "✅ ยืนยันสั่งซื้อ"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
