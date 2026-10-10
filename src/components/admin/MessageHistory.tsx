import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, MessageSquare } from "lucide-react";
import { ChatAttachmentView } from "@/components/ChatAttachmentView";

type Msg = {
  id: string;
  session_id: string | null;
  sender_type: string;
  message: string;
  created_at: string;
  platform: string;
  customer_name: string | null;
  customer_phone: string | null;
  line_user_id: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
};

type Convo = {
  key: string;
  session_id: string;
  platform: string;
  customer_name: string | null;
  customer_phone: string | null;
  messages: Msg[];
  last_at: string;
};

const platformLabel = (p: string) =>
  p === "line" ? "LINE" : p === "web" ? "เว็บ" : p.toUpperCase();

const platformColor = (p: string) =>
  p === "line"
    ? "bg-green-500/15 text-green-700 border-green-500/30"
    : "bg-primary/10 text-primary border-primary/30";

export function MessageHistory() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (data) setMessages(data as Msg[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // จับกลุ่มเป็นการสนทนาต่อลูกค้า (ใช้ session_id)
  const convos = useMemo(() => {
    const map = new Map<string, Convo>();
    for (const m of messages) {
      const sid = m.session_id || "unknown";
      if (!map.has(sid)) {
        map.set(sid, {
          key: sid,
          session_id: sid,
          platform: m.platform || "web",
          customer_name: m.customer_name,
          customer_phone: m.customer_phone,
          messages: [],
          last_at: m.created_at,
        });
      }
      const c = map.get(sid)!;
      c.messages.push(m);
      // เก็บชื่อ/เบอร์ล่าสุดที่มีค่า
      if (m.customer_name) c.customer_name = m.customer_name;
      if (m.customer_phone) c.customer_phone = m.customer_phone;
    }
    return Array.from(map.values());
  }, [messages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return convos.filter((c) => {
      if (platformFilter !== "all" && c.platform !== platformFilter) return false;
      if (!q) return true;
      return (
        c.customer_name?.toLowerCase().includes(q) ||
        c.customer_phone?.includes(q) ||
        c.messages.some((m) => m.message?.toLowerCase().includes(q))
      );
    });
  }, [convos, search, platformFilter]);

  const selectedConvo = filtered.find((c) => c.key === selected) ?? null;

  const senderLabel = (t: string) =>
    t === "admin" ? "ร้าน" : t === "bot" ? "🤖 บอท" : "ลูกค้า";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-foreground">🗂️ ประวัติข้อความ</h2>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading} className="gap-2 rounded-full">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
        </Button>
      </div>

      {/* ตัวกรอง */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 rounded-xl"
            placeholder="ค้นหาชื่อ / เบอร์ / ข้อความ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {["all", "line", "web"].map((p) => (
          <Button
            key={p}
            size="sm"
            variant={platformFilter === p ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setPlatformFilter(p)}
          >
            {p === "all" ? "ทั้งหมด" : platformLabel(p)}
          </Button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4" style={{ minHeight: 400 }}>
        {/* รายชื่อการสนทนา */}
        <div className="space-y-2 md:border-r md:pr-4 border-border max-h-[32rem] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {loading ? "กำลังโหลด..." : "ไม่พบประวัติข้อความ"}
            </p>
          )}
          {filtered.map((c) => (
            <button
              key={c.key}
              onClick={() => setSelected(c.key)}
              className={`w-full text-left p-3 rounded-xl text-sm transition-colors ${
                selected === c.key ? "bg-primary/10 border border-primary/30" : "bg-muted/50 hover:bg-muted"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-foreground truncate">
                  {c.customer_name || c.customer_phone || "ไม่ทราบชื่อ"}
                </p>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${platformColor(c.platform)}`}>
                  {platformLabel(c.platform)}
                </Badge>
              </div>
              {c.customer_phone && (
                <p className="text-xs text-muted-foreground mt-0.5">📞 {c.customer_phone}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {c.messages[0]?.message?.slice(0, 40) || "(ไฟล์แนบ)"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {c.messages.length} ข้อความ · ล่าสุด {new Date(c.last_at).toLocaleString("th-TH")}
              </p>
            </button>
          ))}
        </div>

        {/* เนื้อหาการสนทนา */}
        <div className="md:col-span-2 flex flex-col bg-muted/20 rounded-xl border border-border overflow-hidden">
          {!selectedConvo ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2 py-16">
              <MessageSquare className="h-8 w-8 opacity-40" />
              <p>← เลือกการสนทนาเพื่อดูประวัติ</p>
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-border bg-card flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-semibold text-foreground text-sm">
                    {selectedConvo.customer_name || "ไม่ทราบชื่อ"}
                    {selectedConvo.customer_phone && (
                      <span className="text-muted-foreground font-normal"> · {selectedConvo.customer_phone}</span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground">ID: {selectedConvo.session_id.slice(0, 16)}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${platformColor(selectedConvo.platform)}`}>
                  {platformLabel(selectedConvo.platform)}
                </Badge>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[26rem]">
                {[...selectedConvo.messages].reverse().map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.sender_type === "admin" || m.sender_type === "bot" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                        m.sender_type === "admin"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : m.sender_type === "bot"
                            ? "bg-accent/40 text-foreground rounded-br-md border border-accent"
                            : "bg-card text-foreground rounded-bl-md border border-border"
                      }`}
                    >
                      <p className="text-[10px] font-semibold opacity-70 mb-0.5">
                        {senderLabel(m.sender_type)} · {new Date(m.created_at).toLocaleString("th-TH")}
                      </p>
                      {m.message && <p className="whitespace-pre-wrap">{m.message}</p>}
                      {m.attachment_url && (
                        <ChatAttachmentView url={m.attachment_url} type={m.attachment_type} name={m.attachment_name} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
