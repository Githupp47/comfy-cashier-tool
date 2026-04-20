import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, X, Bell, BellOff } from "lucide-react";
import { usePushNotification } from "@/hooks/usePushNotification";
import { toast } from "sonner";

function getOrCreateSessionId() {
  let id = localStorage.getItem("chat_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("chat_session_id", id);
  }
  return id;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [unread, setUnread] = useState(0);
  const sessionId = useRef(getOrCreateSessionId());
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { isSupported, isSubscribed, subscribe } = usePushNotification();

  useEffect(() => {
    audioRef.current = new Audio("/notification.wav");
    audioRef.current.volume = 0.7;
  }, []);

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId.current)
        .order("created_at");
      if (data) {
        setMessages(data);
        setUnread(data.filter((m: any) => m.sender_type === "admin" && !m.is_read).length);
      }
    };
    fetchMessages();

    const channel = supabase
      .channel(`chat-${sessionId.current}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${sessionId.current}` },
        (payload: any) => {
          setMessages((prev) => [...prev, payload.new]);
          if (payload.new.sender_type === "admin") {
            audioRef.current?.play().catch(() => {});
            if (!open) {
              setUnread((u) => u + 1);
              toast("💬 ข้อความใหม่จากร้าน", { description: payload.new.message });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload: any) => setMessages((prev) => prev.filter((m) => m.id !== payload.old.id))
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      // Mark as read
      supabase
        .from("chat_messages")
        .update({ is_read: true })
        .eq("session_id", sessionId.current)
        .eq("sender_type", "admin")
        .then(() => setUnread(0));
    }
  }, [open, messages]);

  const sendMessage = async () => {
    if (!newMsg.trim()) return;
    await supabase.from("chat_messages").insert({
      session_id: sessionId.current,
      sender_type: "customer",
      message: newMsg.trim(),
    });
    setNewMsg("");
  };

  const handleEnableNotif = async () => {
    const ok = await subscribe();
    if (ok) toast.success("เปิดการแจ้งเตือนแล้ว");
    else toast.error("ไม่สามารถเปิดการแจ้งเตือนได้");
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
        >
          <MessageCircle className="h-6 w-6" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 h-6 min-w-6 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center px-1.5 font-bold border-2 border-background">
              {unread}
            </span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-96 h-[500px] bg-card rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden">
          <div className="bg-primary text-primary-foreground p-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">💬 แชทกับร้าน</p>
              <p className="text-[11px] opacity-80">ตอบกลับโดยเร็วที่สุด</p>
            </div>
            <div className="flex items-center gap-1">
              {isSupported && !isSubscribed && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                  onClick={handleEnableNotif}
                  title="เปิดการแจ้งเตือน"
                >
                  <BellOff className="h-4 w-4" />
                </Button>
              )}
              {isSubscribed && (
                <Bell className="h-4 w-4 mx-2" />
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
            {messages.length === 0 && (
              <p className="text-center text-xs text-muted-foreground pt-12">
                สวัสดีค่ะ! มีอะไรให้ช่วยไหม 🌾
              </p>
            )}
            {messages.map((m: any) => (
              <div
                key={m.id}
                className={`flex ${m.sender_type === "customer" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                    m.sender_type === "customer"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card text-foreground rounded-bl-md border border-border"
                  }`}
                >
                  {m.message}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-border flex gap-2 bg-card">
            <Input
              className="rounded-xl flex-1 text-sm"
              placeholder="พิมพ์ข้อความ..."
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <Button size="icon" className="rounded-xl shrink-0" onClick={sendMessage}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
