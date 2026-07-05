import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Plug, Save, Copy, ExternalLink, MessageCircle, Facebook, Instagram, Send, Sparkles, Bot } from "lucide-react";
import { toast } from "sonner";
import brandLogo from "@/assets/brand-logo.png";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "mzdfpkfdkzlcjegnfxak";
const LINE_WEBHOOK = `https://${PROJECT_ID}.supabase.co/functions/v1/line-webhook`;
const FB_WEBHOOK = `https://${PROJECT_ID}.supabase.co/functions/v1/meta-webhook?platform=facebook`;
const IG_WEBHOOK = `https://${PROJECT_ID}.supabase.co/functions/v1/meta-webhook?platform=instagram`;
const MANYCHAT_WEBHOOK = `https://${PROJECT_ID}.supabase.co/functions/v1/manychat-webhook`;

type Row = {
  id: string | null;
  enabled: boolean;
  token: string;
  secret: string;
  verifyToken: string;
};
const empty: Row = { id: null, enabled: false, token: "", secret: "", verifyToken: "" };

export function MessagingIntegrations() {
  const [line, setLine] = useState<Row>(empty);
  const [fb, setFb] = useState<Row>(empty);
  const [ig, setIg] = useState<Row>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Tester state: input text + last reply per platform
  const [testInput, setTestInput] = useState<Record<string, string>>({
    web: "สวัสดีค่ะ มีอะไรขายบ้าง?",
    line: "สวัสดีค่ะ มีอะไรขายบ้าง?",
    facebook: "สวัสดีค่ะ มีอะไรขายบ้าง?",
    instagram: "สวัสดีค่ะ มีอะไรขายบ้าง?",
  });
  const [testReply, setTestReply] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);

  // Teach-bot state
  const [teachInput, setTeachInput] = useState("");
  const [teaching, setTeaching] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("messaging_integrations").select("*");
      const pick = (p: string): Row => {
        const r = (data ?? []).find((x: any) => x.platform === p);
        if (!r) return empty;
        return {
          id: r.id,
          enabled: r.enabled,
          token: r.channel_access_token ?? "",
          secret: r.channel_secret ?? "",
          verifyToken: r.webhook_secret ?? "",
        };
      };
      setLine(pick("line"));
      setFb(pick("facebook"));
      setIg(pick("instagram"));
      setLoading(false);
    })();
  }, []);

  const save = async (platform: "line" | "facebook" | "instagram", row: Row, setRow: (r: Row) => void) => {
    setSaving(platform);
    const payload: any = {
      platform,
      enabled: row.enabled,
      channel_access_token: row.token.trim() || null,
      channel_secret: row.secret.trim() || null,
      webhook_secret: row.verifyToken.trim() || null,
    };
    const { error } = row.id
      ? await supabase.from("messaging_integrations").update(payload).eq("id", row.id)
      : await supabase.from("messaging_integrations").insert(payload);
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success(`บันทึกการเชื่อมต่อ ${platform.toUpperCase()} แล้ว`);
    if (!row.id) {
      const { data } = await supabase.from("messaging_integrations").select("id").eq("platform", platform).maybeSingle();
      if (data) setRow({ ...row, id: data.id });
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("คัดลอกแล้ว");
  };

  const runTest = async (platform: "web" | "line" | "facebook" | "instagram") => {
    const msg = (testInput[platform] || "").trim();
    if (!msg) return toast.error("พิมพ์ข้อความก่อนนะคะ");
    setTesting(platform);
    setTestReply((r) => ({ ...r, [platform]: "" }));
    const sessionId =
      platform === "web"
        ? `test-web-${Date.now()}`
        : `${platform}:test-${Date.now()}`;
    try {
      // Insert customer message so bot has full context
      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        sender_type: "customer",
        message: msg,
        platform,
        customer_name: "🧪 ทดสอบ",
      });
      const { data, error } = await supabase.functions.invoke("chat-bot-reply", {
        body: { session_id: sessionId, message: msg },
      });
      if (error) throw error;
      if ((data as any)?.skipped) {
        setTestReply((r) => ({
          ...r,
          [platform]: "⚠️ บอทถูกปิดอยู่ — เปิดที่แท็บ \"บอท\" ก่อนนะคะ",
        }));
      } else {
        setTestReply((r) => ({
          ...r,
          [platform]: (data as any)?.reply || "(บอทไม่ตอบ)",
        }));
      }
    } catch (e: any) {
      setTestReply((r) => ({ ...r, [platform]: `❌ ${e.message}` }));
    } finally {
      setTesting(null);
    }
  };

  const teachBot = async () => {
    const rule = teachInput.trim();
    if (!rule) return toast.error("พิมพ์สิ่งที่อยากสอนบอทก่อนนะคะ");
    setTeaching(true);
    const { data: cur } = await supabase
      .from("chat_bot_settings").select("*").limit(1).maybeSingle();
    const prev = cur?.system_prompt || "";
    const marker = "\n\n📚 ความรู้เพิ่มเติมจากแอดมิน:";
    let next: string;
    if (prev.includes(marker)) {
      next = prev + `\n- ${rule}`;
    } else {
      next = prev + `${marker}\n- ${rule}`;
    }
    const { error } = cur?.id
      ? await supabase.from("chat_bot_settings").update({ system_prompt: next }).eq("id", cur.id)
      : await supabase.from("chat_bot_settings").insert({ system_prompt: next, enabled: true });
    setTeaching(false);
    if (error) return toast.error(error.message);
    toast.success("สอนบอทเรียบร้อย บอทจะจำและใช้ในครั้งถัดไป ✨");
    setTeachInput("");
  };

  const Tester = ({ platform, accent }: { platform: "web" | "line" | "facebook" | "instagram"; accent: string }) => (
    <div className="rounded-xl border border-dashed border-border bg-background/50 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Sparkles className={`h-3.5 w-3.5 ${accent}`} /> ทดสอบส่งข้อความให้บอทตอบ
      </div>
      <div className="flex gap-2">
        <Input
          className="rounded-lg text-sm h-9"
          placeholder="พิมพ์ข้อความลูกค้าตัวอย่าง..."
          value={testInput[platform] ?? ""}
          onChange={(e) => setTestInput((r) => ({ ...r, [platform]: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && runTest(platform)}
        />
        <Button
          size="sm"
          className="rounded-lg h-9 gap-1.5 shrink-0"
          onClick={() => runTest(platform)}
          disabled={testing === platform}
        >
          <Send className="h-3.5 w-3.5" />
          {testing === platform ? "กำลังส่ง..." : "ส่ง"}
        </Button>
      </div>
      {testReply[platform] && (
        <div className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap flex gap-2">
          <Bot className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span>{testReply[platform]}</span>
        </div>
      )}
    </div>
  );

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
          <p className="text-xs text-muted-foreground">
            บอทตอบเฉพาะเรื่องสินค้า/บริการของร้าน — สั้น กระชับ อัตโนมัติทุกช่องทาง
          </p>
        </div>
      </div>


      {/* Teach the bot */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <Label className="text-sm font-bold">สอนบอท (Quick Teach)</Label>
              <p className="text-xs text-muted-foreground">
                พิมพ์กฎ/ข้อมูล 1 บรรทัด — บอทจะจำและใช้ในทุกช่องทางทันที
              </p>
            </div>
          </div>
          <Textarea
            className="rounded-xl text-sm min-h-[70px]"
            placeholder={`เช่น: ร้านเปิด 9:00-20:00 ทุกวัน หยุดวันจันทร์\nส่งฟรีเมื่อสั่งครบ 300 บาท\nโปรวันเกิดลด 15%`}
            value={teachInput}
            onChange={(e) => setTeachInput(e.target.value)}
          />
          <Button onClick={teachBot} disabled={teaching} className="rounded-xl h-10 gap-2">
            <Sparkles className="h-4 w-4" /> {teaching ? "กำลังสอน..." : "สอนบอท"}
          </Button>
        </CardContent>
      </Card>

      {/* Web widget tester */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <Label className="text-sm font-medium">ทดสอบบอทหน้าเว็บ</Label>
              <p className="text-xs text-muted-foreground">ลองส่งข้อความและดูบอทตอบทันที (ไม่ต้องเปิด LINE/FB)</p>
            </div>
          </div>
          <Tester platform="web" accent="text-primary" />
        </CardContent>
      </Card>

      {/* ManyChat One-Click FB/IG Bridge */}
      <Card className="border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 to-blue-500/5">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center shrink-0">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <Label className="text-base font-bold">⚡ วิธีง่ายสุด: เชื่อม FB + IG ผ่าน ManyChat</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                คลิกเดียวเชื่อมเพจ FB/IG ไม่ต้องสร้าง Meta App ไม่ต้องรอรีวิว 🎉
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">🔗 Webhook URL สำหรับ ManyChat</Label>
            <div className="flex gap-2">
              <Input className="rounded-xl font-mono text-xs" value={MANYCHAT_WEBHOOK} readOnly />
              <Button variant="outline" size="icon" className="rounded-xl shrink-0" onClick={() => copy(MANYCHAT_WEBHOOK)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="bg-background rounded-xl p-4 text-xs space-y-3 leading-relaxed border border-border">
            <p className="font-bold text-foreground text-sm">📘 วิธีตั้งค่า (5 นาที)</p>
            <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
              <li>
                สมัครฟรีที่{" "}
                <a href="https://manychat.com" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1 font-medium">
                  ManyChat.com <ExternalLink className="h-3 w-3" />
                </a>{" "}
                → กด <b>"Get Started"</b> → login ด้วย Facebook (คลิกเดียว) → เลือกเพจ FB/IG
              </li>
              <li>
                ใน ManyChat → เมนู <b>Automation</b> → <b>New Flow</b> → เพิ่ม trigger <b>"Default Reply"</b> (บอทตอบทุกข้อความ)
              </li>
              <li>
                เพิ่ม Action <b>"External Request"</b>:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Method: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">POST</code></li>
                  <li>URL: วาง Webhook URL ด้านบน</li>
                  <li>Body Type: <b>JSON</b></li>
                  <li>
                    Body:
                    <pre className="bg-muted p-2 rounded mt-1 text-[10px] overflow-x-auto">
{`{
  "subscriber_id": "{{user_id}}",
  "message": "{{last_input_text}}",
  "platform": "facebook",
  "name": "{{first_name}}"
}`}
                    </pre>
                  </li>
                  <li>Response Mapping: กด <b>"Test the Request"</b> → เลือก field <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">reply</code> → Save as <b>bot_reply</b></li>
                </ul>
              </li>
              <li>เพิ่ม <b>"Send Message"</b> ต่อจาก External Request → เนื้อหาใส่ <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{`{{bot_reply}}`}</code></li>
              <li>กด <b>Publish</b> → ทักเพจตัวเองทดสอบเลย! 🎉</li>
            </ol>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mt-2">
              <p className="text-emerald-700 dark:text-emerald-400 font-medium text-xs">
                ✅ ManyChat ฟรีถึง 1,000 contacts — พอสำหรับร้านส่วนใหญ่
              </p>
              <p className="text-emerald-700 dark:text-emerald-400 text-xs mt-1">
                💡 สำหรับ IG: ในขั้นตอนที่ 3 เปลี่ยน <code className="bg-white/50 dark:bg-black/30 px-1 rounded">"platform": "instagram"</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-border">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between bg-[#06C755]/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#06C755] flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-white" />
              </div>
              <div>
                <Label className="text-sm font-medium">LINE Messaging API</Label>
                <p className="text-xs text-muted-foreground mt-0.5">รับ-ส่งข้อความผ่าน LINE OA</p>
              </div>
            </div>
            <Switch checked={line.enabled} onCheckedChange={(v) => setLine({ ...line, enabled: v })} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Channel Access Token (long-lived)</Label>
            <Input type="password" className="rounded-xl font-mono text-xs" value={line.token} onChange={(e) => setLine({ ...line, token: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Channel Secret</Label>
            <Input type="password" className="rounded-xl font-mono text-xs" value={line.secret} onChange={(e) => setLine({ ...line, secret: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Webhook URL (วางใน LINE Developer Console)</Label>
            <div className="flex gap-2">
              <Input className="rounded-xl font-mono text-xs" value={LINE_WEBHOOK} readOnly />
              <Button variant="outline" size="icon" className="rounded-xl shrink-0" onClick={() => copy(LINE_WEBHOOK)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button onClick={() => save("line", line, setLine)} disabled={saving === "line"} className="w-full rounded-xl h-11 gap-2">
            <Save className="h-4 w-4" /> {saving === "line" ? "กำลังบันทึก..." : "บันทึก LINE"}
          </Button>

          <div className="bg-muted/50 rounded-xl p-4 text-xs space-y-2 leading-relaxed">
            <p className="font-semibold text-foreground">📘 วิธีตั้งค่า LINE OA</p>
            <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
              <li>เข้า <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">LINE Developers <ExternalLink className="h-3 w-3" /></a> → สร้าง Messaging API channel</li>
              <li>คัดลอก <b>Channel secret</b> และออก <b>Channel access token</b> มาวางด้านบน</li>
              <li>วาง Webhook URL → กด Verify → เปิด Use webhook</li>
              <li>ปิด Auto-reply / Greeting messages เพื่อให้บอทตอบเอง</li>
            </ol>
          </div>
          <Tester platform="line" accent="text-[#06C755]" />
        </CardContent>
      </Card>

      {/* Facebook Messenger */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between bg-[#1877F2]/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#1877F2] flex items-center justify-center">
                <Facebook className="h-5 w-5 text-white" />
              </div>
              <div>
                <Label className="text-sm font-medium">Facebook Messenger</Label>
                <p className="text-xs text-muted-foreground mt-0.5">รับ-ส่งข้อความผ่านเพจ Facebook</p>
              </div>
            </div>
            <Switch checked={fb.enabled} onCheckedChange={(v) => setFb({ ...fb, enabled: v })} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Page Access Token</Label>
            <Input type="password" className="rounded-xl font-mono text-xs" value={fb.token} onChange={(e) => setFb({ ...fb, token: e.target.value })} placeholder="EAAG..." />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">App Secret (ใช้ตรวจ signature)</Label>
            <Input type="password" className="rounded-xl font-mono text-xs" value={fb.secret} onChange={(e) => setFb({ ...fb, secret: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Verify Token (ตั้งเองเป็นสตริงลับ)</Label>
            <Input className="rounded-xl font-mono text-xs" value={fb.verifyToken} onChange={(e) => setFb({ ...fb, verifyToken: e.target.value })} placeholder="my-secret-123" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Callback URL (ใส่ใน Meta App Dashboard)</Label>
            <div className="flex gap-2">
              <Input className="rounded-xl font-mono text-xs" value={FB_WEBHOOK} readOnly />
              <Button variant="outline" size="icon" className="rounded-xl shrink-0" onClick={() => copy(FB_WEBHOOK)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button onClick={() => save("facebook", fb, setFb)} disabled={saving === "facebook"} className="w-full rounded-xl h-11 gap-2 bg-[#1877F2] hover:bg-[#1877F2]/90">
            <Save className="h-4 w-4" /> {saving === "facebook" ? "กำลังบันทึก..." : "บันทึก Facebook"}
          </Button>

          <div className="bg-muted/50 rounded-xl p-4 text-xs space-y-2 leading-relaxed">
            <p className="font-semibold text-foreground">📘 วิธีตั้งค่า Facebook Messenger</p>
            <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
              <li>เข้า <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">Meta for Developers <ExternalLink className="h-3 w-3" /></a> → Create App (Business)</li>
              <li>เพิ่ม product <b>Messenger</b> → เลือกเพจ → ออก <b>Page Access Token</b> มาวางด้านบน</li>
              <li>คัดลอก <b>App Secret</b> จาก Settings → Basic มาวาง</li>
              <li>ที่ Messenger → Webhooks: วาง Callback URL ด้านบน, ใส่ Verify Token ให้ตรงกัน, Subscribe fields: <b>messages</b>, <b>messaging_postbacks</b></li>
              <li>Subscribe เพจกับ webhook แล้วทักลองเลย</li>
            </ol>
          </div>
          <Tester platform="facebook" accent="text-[#1877F2]" />
        </CardContent>
      </Card>

      {/* Instagram */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between bg-gradient-to-r from-[#E4405F]/10 to-[#F77737]/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#E4405F] to-[#F77737] flex items-center justify-center">
                <Instagram className="h-5 w-5 text-white" />
              </div>
              <div>
                <Label className="text-sm font-medium">Instagram DM</Label>
                <p className="text-xs text-muted-foreground mt-0.5">ต้องเป็นบัญชี IG Business เชื่อมกับเพจ FB</p>
              </div>
            </div>
            <Switch checked={ig.enabled} onCheckedChange={(v) => setIg({ ...ig, enabled: v })} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Page Access Token (เพจที่ผูก IG)</Label>
            <Input type="password" className="rounded-xl font-mono text-xs" value={ig.token} onChange={(e) => setIg({ ...ig, token: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">App Secret</Label>
            <Input type="password" className="rounded-xl font-mono text-xs" value={ig.secret} onChange={(e) => setIg({ ...ig, secret: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Verify Token</Label>
            <Input className="rounded-xl font-mono text-xs" value={ig.verifyToken} onChange={(e) => setIg({ ...ig, verifyToken: e.target.value })} placeholder="my-secret-ig-123" />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Callback URL (Instagram webhook)</Label>
            <div className="flex gap-2">
              <Input className="rounded-xl font-mono text-xs" value={IG_WEBHOOK} readOnly />
              <Button variant="outline" size="icon" className="rounded-xl shrink-0" onClick={() => copy(IG_WEBHOOK)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button onClick={() => save("instagram", ig, setIg)} disabled={saving === "instagram"} className="w-full rounded-xl h-11 gap-2 bg-gradient-to-r from-[#E4405F] to-[#F77737] hover:opacity-90">
            <Save className="h-4 w-4" /> {saving === "instagram" ? "กำลังบันทึก..." : "บันทึก Instagram"}
          </Button>

          <div className="bg-muted/50 rounded-xl p-4 text-xs space-y-2 leading-relaxed">
            <p className="font-semibold text-foreground">📘 วิธีตั้งค่า Instagram DM</p>
            <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
              <li>แปลง IG เป็น <b>Business/Creator account</b> แล้ว <b>Link กับเพจ Facebook</b></li>
              <li>ใน Meta App เดิม → เพิ่ม product <b>Instagram → Instagram Messaging</b></li>
              <li>ที่ App → Settings ของ IG: เปิด <b>Connected Tools</b> และอนุญาตให้ตอบข้อความ</li>
              <li>ใน Webhooks → Instagram: วาง Callback URL ด้านบน + Verify Token ให้ตรงกัน, Subscribe field: <b>messages</b></li>
              <li>ใช้ Page Access Token ตัวเดียวกับเพจ FB ที่ผูก IG</li>
            </ol>
            <p className="text-muted-foreground pt-1">
              ⚠️ ต้องเปิด "บอทตอบแชทอัตโนมัติ" ในแท็บ <b>บอท</b> ด้วย บอทจึงจะตอบ
            </p>
          </div>
          <Tester platform="instagram" accent="text-[#E4405F]" />
        </CardContent>
      </Card>
    </div>
  );
}
