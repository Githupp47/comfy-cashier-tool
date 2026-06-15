import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Plug, Save, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import brandLogo from "@/assets/brand-logo.png";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "mzdfpkfdkzlcjegnfxak";
const WEBHOOK_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/line-webhook`;

export function MessagingIntegrations() {
  const [id, setId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("messaging_integrations")
        .select("*")
        .eq("platform", "line")
        .maybeSingle();
      if (data) {
        setId(data.id);
        setEnabled(data.enabled);
        setToken(data.channel_access_token ?? "");
        setSecret(data.channel_secret ?? "");
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = {
      platform: "line",
      enabled,
      channel_access_token: token.trim() || null,
      channel_secret: secret.trim() || null,
    };
    const { error } = id
      ? await supabase.from("messaging_integrations").update(payload).eq("id", id)
      : await supabase.from("messaging_integrations").insert(payload).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("บันทึกการเชื่อมต่อ LINE แล้ว");
    if (!id) {
      const { data } = await supabase
        .from("messaging_integrations")
        .select("id")
        .eq("platform", "line")
        .maybeSingle();
      if (data) setId(data.id);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("คัดลอกแล้ว");
  };

  if (loading) return <p className="text-sm text-muted-foreground">กำลังโหลด...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <img src={brandLogo} alt="HAKKŌ" className="h-10 w-10 rounded-lg object-cover" />
        <div>
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">เชื่อมต่อแพลตฟอร์มแชท</h2>
          </div>
          <p className="text-xs text-muted-foreground">ให้บอทตอบลูกค้าใน LINE และแพลตฟอร์มอื่นๆ ได้อัตโนมัติ</p>
        </div>
      </div>

      {/* LINE */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center justify-between bg-[#06C755]/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#06C755] flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <Label className="text-sm font-medium">LINE Messaging API</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  เปิดเพื่อให้บอทรับ-ส่งข้อความผ่าน LINE OA ของคุณ
                </p>
              </div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Channel Access Token (Long-lived)</Label>
            <Input
              className="rounded-xl font-mono text-xs"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="xxxxxxxx..."
              type="password"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Channel Secret</Label>
            <Input
              className="rounded-xl font-mono text-xs"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="xxxxxxxx..."
              type="password"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Webhook URL (ใส่ใน LINE Developer Console)</Label>
            <div className="flex gap-2">
              <Input className="rounded-xl font-mono text-xs" value={WEBHOOK_URL} readOnly />
              <Button variant="outline" size="icon" className="rounded-xl shrink-0" onClick={() => copy(WEBHOOK_URL)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button onClick={save} disabled={saving} className="w-full rounded-xl h-11 gap-2">
            <Save className="h-4 w-4" /> {saving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>

          <div className="bg-muted/50 rounded-xl p-4 text-xs space-y-2 leading-relaxed">
            <p className="font-semibold text-foreground">📘 วิธีตั้งค่า LINE Official Account</p>
            <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
              <li>
                เข้า{" "}
                <a
                  href="https://developers.line.biz/console/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                >
                  LINE Developers Console <ExternalLink className="h-3 w-3" />
                </a>{" "}
                เลือก Provider → สร้าง <b>Messaging API channel</b>
              </li>
              <li>
                ในแท็บ <b>Basic settings</b> คัดลอก <b>Channel secret</b> มาวางด้านบน
              </li>
              <li>
                ในแท็บ <b>Messaging API</b> กดออก <b>Channel access token (long-lived)</b> แล้วคัดลอกมาวาง
              </li>
              <li>
                ที่ช่อง <b>Webhook URL</b> วาง URL ด้านบน → กด <b>Verify</b> → เปิด <b>Use webhook</b>
              </li>
              <li>
                ปิด <b>Auto-reply messages</b> และ <b>Greeting messages</b> เพื่อให้บอทตอบเอง
              </li>
              <li>
                สแกน QR ของ OA เพิ่มเป็นเพื่อน แล้วทักลองได้เลย — บอทจะตอบและขึ้นในแท็บ <b>แชท</b> ของแอดมินด้วย
              </li>
            </ol>
            <p className="text-muted-foreground pt-1">
              ⚠️ ต้องเปิดสวิตช์ "บอทตอบแชทอัตโนมัติ" ในแท็บ <b>บอท</b> ด้วย บอทจึงจะตอบลูกค้า
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed border-border bg-muted/30">
        <CardContent className="p-5 text-center text-sm text-muted-foreground">
          🚧 Facebook Messenger / Instagram / WhatsApp — เร็วๆ นี้
        </CardContent>
      </Card>
    </div>
  );
}
