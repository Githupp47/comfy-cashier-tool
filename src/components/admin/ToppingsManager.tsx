import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Topping = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  stock_quantity: number;
  is_available: boolean;
  sort_order: number;
};

export function ToppingsManager() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Topping> | null>(null);
  const [open, setOpen] = useState(false);

  const { data: toppings = [] } = useQuery({
    queryKey: ["admin-toppings"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("toppings").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Topping[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (t: Partial<Topping>) => {
      const payload: any = {
        name: t.name,
        price: Number(t.price ?? 0),
        description: t.description ?? null,
        stock_quantity: Number(t.stock_quantity ?? 0),
        is_available: t.is_available ?? true,
        sort_order: Number(t.sort_order ?? 0),
      };
      if (t.id) {
        const { error } = await (supabase.from as any)("toppings").update(payload).eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("toppings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-toppings"] });
      qc.invalidateQueries({ queryKey: ["toppings"] });
      setOpen(false);
      setEdit(null);
      toast.success("บันทึกท็อปปิ้งสำเร็จ");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("toppings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-toppings"] });
      qc.invalidateQueries({ queryKey: ["toppings"] });
      toast.success("ลบสำเร็จ");
    },
  });

  const openNew = () => {
    setEdit({ name: "", price: 0, is_available: true, sort_order: 0, stock_quantity: 0 });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> จัดการท็อปปิ้ง</h2>
          <p className="text-sm text-muted-foreground">{toppings.length} รายการ · ลูกค้าเลือกเพิ่มในตอนสั่งซื้อ</p>
        </div>
        <Button onClick={openNew} className="rounded-xl gap-2"><Plus className="h-4 w-4" /> เพิ่มท็อปปิ้ง</Button>
      </div>

      <div className="grid gap-3">
        {toppings.map((t) => (
          <Card key={t.id} className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold truncate">{t.name}</p>
                  <Badge variant={t.is_available ? "default" : "secondary"} className="text-[10px]">
                    {t.is_available ? "✓ พร้อมขาย" : "ปิด"}
                  </Badge>
                  <Badge variant={t.stock_quantity <= 5 ? "destructive" : "outline"} className="text-[10px] gap-1">
                    {t.stock_quantity <= 5 && <AlertTriangle className="h-3 w-3" />} สต็อก: {t.stock_quantity}
                  </Badge>
                </div>
                {t.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>}
                <p className="text-primary font-bold mt-1">+฿{t.price}</p>
              </div>
              <Button size="icon" variant="outline" className="rounded-xl h-9 w-9" onClick={() => { setEdit(t); setOpen(true); }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="rounded-xl h-9 w-9 text-destructive"
                onClick={() => { if (confirm("ลบท็อปปิ้งนี้?")) deleteMutation.mutate(t.id); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {toppings.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>ยังไม่มีท็อปปิ้ง</p>
            <Button variant="outline" className="mt-3 rounded-xl" onClick={openNew}>เพิ่มรายการแรก</Button>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>{edit?.id ? "แก้ไขท็อปปิ้ง" : "เพิ่มท็อปปิ้งใหม่"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1"><Label>ชื่อ</Label>
                <Input className="rounded-xl" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="เช่น ข้าวพอง" />
              </div>
              <div className="space-y-1"><Label>คำอธิบาย</Label>
                <Input className="rounded-xl" value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1"><Label>ราคา</Label>
                  <Input className="rounded-xl" type="number" value={edit.price ?? 0} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} />
                </div>
                <div className="space-y-1"><Label>สต็อก</Label>
                  <Input className="rounded-xl" type="number" value={edit.stock_quantity ?? 0} onChange={(e) => setEdit({ ...edit, stock_quantity: Number(e.target.value) })} />
                </div>
                <div className="space-y-1"><Label>ลำดับ</Label>
                  <Input className="rounded-xl" type="number" value={edit.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex items-center gap-3 bg-muted/40 rounded-xl p-3">
                <Switch checked={edit.is_available ?? true} onCheckedChange={(v) => setEdit({ ...edit, is_available: v })} />
                <Label>เปิดขาย</Label>
              </div>
              <Button className="w-full rounded-xl h-11" onClick={() => saveMutation.mutate(edit)} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "กำลังบันทึก..." : "💾 บันทึก"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
