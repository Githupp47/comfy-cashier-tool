import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Trash2, Paperclip, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { uploadChatFile } from "@/lib/chatUpload";
import { ChatAttachmentView } from "@/components/ChatAttachmentView";

type SessionRow = { session_id: string; last_message: string; last_at: string; unread: number };

export function AdminChat() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectedRef = useRef<string | null>(null);

  useEffect(() => { selectedRef.current = selectedSession; }, [selectedSession]);

  useEffect(() => {
    audioRef.current = new Audio("/notification.wav");
    audioRef.current.volume = 0.8;
  }, []);

  const fetchSessions = async () => {
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: false });
    if (!data) return;
    const sessionMap = new Map<string, SessionRow>();
    data.forEach((m: any) => {
      const sid = m.session_id || m.order_id || "unknown";
      if (!sessionMap.has(sid)) {
        sessionMap.set(sid, { session_id: sid, last_message: m.message, last_at: m.created_at, unread: 0 });
      }
      if (m.sender_type === "customer" && !m.is_read) {
        sessionMap.get(sid)!.unread++;
      }
    });
    setSessions(Array.from(sessionMap.values()));
  };

  useEffect(() => { fetchSessions(); }, []);

  // Global listener: notify on any new customer message
  useEffect(() => {
    const channel = supabase
      .channel("admin-chat-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload: any) => {
          const m = payload.new;
          if (m.sender_type === "customer") {
            audioRef.current?.play().catch(() => {});
            if (selectedRef.current !== m.session_id) {
              toast("💬 ข้อความใหม่จากลูกค้า", { description: m.message });
            }
            fetchSessions();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        () => fetchSessions()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!selectedSession) return;
    const fetchMsgs = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", selectedSession)
        .order("created_at");
      if (data) setMessages(data);
      await supabase.from("chat_messages").update({ is_read: true })
        .eq("session_id", selectedSession).eq("sender_type", "customer");
    };
    fetchMsgs();

    const channel = supabase
      .channel(`admin-chat-${selectedSession}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${selectedSession}` },
        (payload) => { setMessages(prev => [...prev, payload.new]); })
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload: any) => { setMessages(prev => prev.filter(m => m.id !== payload.old.id)); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedSession]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedSession) return;
    const text = newMsg.trim();
    await supabase.from("chat_messages").insert({
      session_id: selectedSession, sender_type: "admin", message: text,
    });
    setNewMsg("");
    // Send push notification to customer
    supabase.functions.invoke("send-push", {
      body: {
        session_id: selectedSession,
        title: "💬 ข้อความจากร้าน HAKKŌ",
        body: text.slice(0, 100),
        url: "/",
      },
    }).catch(() => {});
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from("chat_messages").delete().eq("id", id);
    if (error) {
      toast.error("ลบข้อความไม่สำเร็จ: " + error.message);
      return;
    }
    setMessages(prev => prev.filter(m => m.id !== id));
    toast.success("ลบข้อความแล้ว");
  };

  const deleteSession = async (sessionId: string) => {
    const { error } = await supabase.from("chat_messages").delete().eq("session_id", sessionId);
    if (error) {
      toast.error("ลบเซสชันไม่สำเร็จ: " + error.message);
      return;
    }
    if (selectedSession === sessionId) {
      setSelectedSession(null);
      setMessages([]);
    }
    await fetchSessions();
    toast.success("ลบเซสชันแชททั้งหมดแล้ว");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-foreground">💬 แชทกับลูกค้า</h2>

      <div className="grid md:grid-cols-3 gap-4" style={{ minHeight: 400 }}>
        {/* Session list */}
        <div className="space-y-2 md:border-r md:pr-4 border-border">
          <p className="text-xs text-muted-foreground font-medium">เซสชันแชท</p>
          {sessions.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีแชท</p>}
          {sessions.map(s => (
            <div key={s.session_id} className={`group relative rounded-xl text-sm transition-colors ${selectedSession === s.session_id ? "bg-primary/10 border border-primary/30" : "bg-muted/50 hover:bg-muted"}`}>
              <button onClick={() => setSelectedSession(s.session_id)} className="w-full text-left p-3 pr-10">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground truncate flex-1">💬 {s.last_message.slice(0, 30)}{s.last_message.length > 30 ? "..." : ""}</p>
                  {s.unread > 0 && (
                    <span className="ml-2 h-5 min-w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center px-1 font-bold shrink-0">
                      {s.unread}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">🕐 {new Date(s.last_at).toLocaleString("th-TH")}</p>
                <p className="text-[10px] text-muted-foreground">ID: {s.session_id.slice(0, 8)}</p>
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7 text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>ลบเซสชันแชท?</AlertDialogTitle>
                    <AlertDialogDescription>
                      จะลบข้อความทั้งหมดของเซสชันนี้ ไม่สามารถกู้คืนได้
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteSession(s.session_id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">ลบ</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>

        {/* Chat area */}
        <div className="md:col-span-2 flex flex-col bg-muted/20 rounded-xl border border-border overflow-hidden">
          {!selectedSession ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              <p>← เลือกเซสชันเพื่อดูแชท</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-80">
                {messages.map((m: any) => (
                  <div key={m.id} className={`group flex items-center gap-1 ${m.sender_type === "admin" ? "justify-end" : "justify-start"}`}>
                    {m.sender_type === "admin" && (
                      <Button size="icon" variant="ghost" onClick={() => deleteMessage(m.id)}
                        className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                      m.sender_type === "admin"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-card text-foreground rounded-bl-md border border-border"
                    }`}>
                      {m.message}
                    </div>
                    {m.sender_type !== "admin" && (
                      <Button size="icon" variant="ghost" onClick={() => deleteMessage(m.id)}
                        className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {messages.length === 0 && <p className="text-center text-xs text-muted-foreground pt-8">ยังไม่มีข้อความ</p>}
                <div ref={bottomRef} />
              </div>
              <div className="p-3 border-t border-border flex gap-2 bg-card">
                <Input className="rounded-xl flex-1 text-sm" placeholder="พิมพ์ตอบกลับ..." value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
                <Button size="icon" className="rounded-xl shrink-0" onClick={sendMessage}><Send className="h-4 w-4" /></Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
