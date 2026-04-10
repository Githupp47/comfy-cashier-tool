import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image, Store, CreditCard } from "lucide-react";
import { toast } from "sonner";

export function ShopSettings() {
  const queryClient = useQueryClient();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);

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

      let qrUrl = form.payment_qr_url;
      if (qrFile) {
        const ext = qrFile.name.split(".").pop();
        const fileName = `qr_${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("product-images").upload(fileName, qrFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(fileName);
        qrUrl = urlData.publicUrl;
      }

      const updates: Record<string, string> = { ...form, logo_url: logoUrl, payment_qr_url: qrUrl };
      for (const [key, value] of Object.entries(updates)) {
        // Try update first, if no rows affected then insert
        const { data, error } = await supabase.from("shop_settings").update({ value }).eq("key", key).select();
        if (error) throw error;
        if (!data || data.length === 0) {
          const { error: insertErr } = await supabase.from("shop_settings").insert({ key, value });
          if (insertErr) throw insertErr;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-settings"] });
      setLogoFile(null);
      setQrFile(null);
      toast.success("บันทึกการตั้งค่าสำเร็จ");
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (isLoading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-lg space-y-6">
      <div><h2 className="text-xl font-bold text-foreground">⚙️ ตั้งค่าร้าน & แบรนด์</h2><p className="text-sm text-muted-foreground">จัดการข้อมูลร้าน โลโก้ และข้อมูลชำระเงิน</p></div>

      {/* Logo */}
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

      {/* Shop Info */}
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

      {/* Payment Settings */}
      <Card className="border-border overflow-hidden">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> ข้อมูลการชำระเงิน</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">รูป QR Code PromptPay</Label>
            {form.payment_qr_url && !qrFile && (
              <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
                <img src={form.payment_qr_url} alt="QR Code" className="h-40 mx-auto rounded-lg object-contain" />
              </div>
            )}
            <Input className="rounded-xl" type="file" accept="image/*" onChange={(e) => setQrFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">ชื่อธนาคาร</Label>
            <Input className="rounded-xl" value={form.payment_bank_name ?? ""} onChange={(e) => setForm({ ...form, payment_bank_name: e.target.value })} placeholder="เช่น SCB (ไทยพาณิชย์)" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">เลขบัญชี</Label>
            <Input className="rounded-xl" value={form.payment_bank_account ?? ""} onChange={(e) => setForm({ ...form, payment_bank_account: e.target.value })} placeholder="เช่น 4230504802" />
          </div>
        </CardContent>
      </Card>

      <Button className="w-full bg-primary text-primary-foreground rounded-xl h-12 text-base shadow-sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "กำลังบันทึก..." : "💾 บันทึกการตั้งค่า"}
      </Button>
    </div>
  );
}
