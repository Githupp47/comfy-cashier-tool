import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Bot, Save } from "lucide-react";
import { toast } from "sonner";
import brandLogo from "@/assets/brand-logo.png";

export function BotSettings() {
  const [id, setId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("chat_bot_settings").select("*").limit(1).maybeSingle();
      if (data) {
        setId(data.id);
        setEnabled(data.enabled);
        setPrompt(data.system_prompt);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = { enabled, system_prompt: prompt };
    const { error } = id
      ? await supabase.from("chat_bot_settings").update(payload).eq("id", id)
      : await supabase.from("chat_bot_settings").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("บันทึกการตั้งค่าบอทแล้ว");
  };

  if (loading) return <p className="text-sm text-muted-foreground">กำลังโหลด...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img src={brandLogo} alt="HAKKŌ" className="h-10 w-10 rounded-lg object-cover" />
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">บอทตอบแชทอัตโนมัติ</h2>
        </div>
      </div>

      <Card className="border-border">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center justify-between bg-muted/50 rounded-xl p-4">
            <div>
              <Label className="text-sm font-medium">เปิดใช้งานบอท</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                เมื่อเปิด บอท AI จะตอบลูกค้าอัตโนมัติทันทีที่มีข้อความเข้ามา
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">บุคลิก / คำสั่งของบอท (System Prompt)</Label>
            <Textarea
              className="rounded-xl min-h-[160px] text-sm"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={`เช่น: คุณเป็นพนักงานร้าน HAKKŌ ตอบสั้น กระชับ 1-3 บรรทัด ใช้ emoji น่ารัก เป็นกันเอง`}
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>💡 บอทรู้สินค้า/ราคา/สต็อกเอง ตอบสั้น 1-3 บรรทัด อัตโนมัติ</p>
              <p>🛠️ ใช้เครื่องมือได้: ดูสินค้า, ส่งรูปสินค้า, สรุปยอดขาย, เช็คสต็อก, อ่านสลิป/รูป</p>
            </div>
          </div>

          <Button onClick={save} disabled={saving} className="w-full rounded-xl h-11 gap-2">
            <Save className="h-4 w-4" /> {saving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
