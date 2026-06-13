import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Send, X, Bell, BellOff, History } from "lucide-react";
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
  const [sessionId, setSessionId] = useState<string>(() => getOrCreateSessionId());
  const [customerName, setCustomerName] = useState<string>(() => localStorage.getItem("chat_customer_name") || "");
  const [customerPhone, setCustomerPhone] = useState<string>(() => localStorage.getItem("chat_customer_phone") || "");
  const [showProfile, setShowProfile] = useState(false);
  const [showRecover, setShowRecover] = useState(false);
  const [recoverPhone, setRecoverPhone] = useState("");
  const [recovering, setRecovering] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { isSupported, isSubscribed, subscribe } = usePushNotification();

  useEffect(() => {
    audioRef.current = new Audio("/notification.wav");
    audioRef.current.volume = 0.7;
  }, []);

  // Load messages for current session + subscribe
  useEffect(() => {
    let active = true;
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at");
      if (!active) return;
      if (data) {
        setMessages(data);
        setUnread(data.filter((m: any) => m.sender_type === "admin" && !m.is_read).length);
      }
    };
    fetchMessages();

    const channel = supabase
      .channel(`chat-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `session_id=eq.${sessionId}` },
        (payload: any) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
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
      active = false;
      supabase.removeChannel(channel);
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark as read when chat opens
  useEffect(() => {
    if (open && unread > 0) {
      supabase
        .from("chat_messages")
        .update({ is_read: true })
        .eq("session_id", sessionId)
        .eq("sender_type", "admin")
        .then(() => setUnread(0));
    }
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, messages, sessionId, unread]);

  const sendMessage = async () => {
    if (!newMsg.trim()) return;
    if (!customerPhone.trim()) {
      setShowProfile(true);
      toast("กรุณากรอกเบอร์โทรเพื่อให้ทางร้านติดต่อกลับได้");
      return;
    }
    const text = newMsg.trim();
    setNewMsg("");
    await supabase.from("chat_messages").insert({
      session_id: sessionId,
      sender_type: "customer",
      message: text,
      customer_phone: customerPhone.trim(),
      customer_name: customerName.trim() || null,
    });
  };

  const saveProfile = () => {
    if (!customerPhone.trim()) {
      toast.error("กรุณากรอกเบอร์โทร");
      return;
    }
    localStorage.setItem("chat_customer_phone", customerPhone.trim());
    localStorage.setItem("chat_customer_name", customerName.trim());
    setShowProfile(false);
    toast.success("บันทึกข้อมูลแล้ว");
  };

  const recoverByPhone = async () => {
    const phone = recoverPhone.trim();
    if (!phone) return toast.error("กรอกเบอร์โทร");
    setRecovering(true);
    const { data, error } = await supabase
      .from("chat_messages")
      .select("session_id, created_at")
      .eq("customer_phone", phone)
      .order("created_at", { ascending: false })
      .limit(1);
    setRecovering(false);
    if (error) return toast.error(error.message);
    if (!data || data.length === 0 || !data[0].session_id) {
      return toast.error("ไม่พบแชทเก่าของเบอร์นี้");
    }
    const sid = data[0].session_id as string;
    localStorage.setItem("chat_session_id", sid);
    localStorage.setItem("chat_customer_phone", phone);
    setCustomerPhone(phone);
    setSessionId(sid);
    setShowRecover(false);
    setRecoverPhone("");
    toast.success("กู้คืนแชทเก่าแล้ว 🎉");
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
          aria-label="เปิดแชท"
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
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-96 h-[540px] bg-card rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden">
          <div className="bg-primary text-primary-foreground p-3 flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">💬 แชทกับร้าน{customerName ? ` · ${customerName}` : ""}</p>
              <p className="text-[11px] opacity-80 truncate">
                {customerPhone ? `📱 ${customerPhone}` : "ตอบกลับโดยเร็วที่สุด"}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
                onClick={() => setShowRecover(true)}
                title="ดูแชทเก่าด้วยเบอร์โทร"
              >
                <History className="h-4 w-4" />
              </Button>
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
              {isSubscribed && <Bell className="h-4 w-4 mx-2" />}
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

          {/* Profile form (first-time or when phone missing) */}
          {(showProfile || (!customerPhone && messages.length === 0)) && (
            <div className="p-4 bg-muted/30 border-b border-border space-y-3">
              <p className="text-xs text-muted-foreground">
                กรอกข้อมูลเพื่อให้ทางร้านติดต่อกลับ และดูแชทเก่าได้ในอนาคต
              </p>
              <div className="space-y-1">
                <Label className="text-xs">ชื่อ (ไม่บังคับ)</Label>
                <Input
                  className="rounded-xl text-sm h-9"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="ชื่อของคุณ"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">เบอร์โทร *</Label>
                <Input
                  className="rounded-xl text-sm h-9"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0xx-xxx-xxxx"
                  inputMode="tel"
                />
              </div>
              <Button size="sm" className="w-full rounded-xl" onClick={saveProfile}>
                บันทึก & เริ่มแชท
              </Button>
            </div>
          )}

          {/* Recover dialog */}
          {showRecover && (
            <div className="p-4 bg-muted/30 border-b border-border space-y-3">
              <p className="text-xs text-muted-foreground">
                กรอกเบอร์โทรเดิมเพื่อกู้คืนแชทเก่าจากอุปกรณ์อื่น
              </p>
              <Input
                className="rounded-xl text-sm h-9"
                value={recoverPhone}
                onChange={(e) => setRecoverPhone(e.target.value)}
                placeholder="0xx-xxx-xxxx"
                inputMode="tel"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => setShowRecover(false)}>
                  ยกเลิก
                </Button>
                <Button size="sm" className="flex-1 rounded-xl" onClick={recoverByPhone} disabled={recovering}>
                  {recovering ? "กำลังค้นหา..." : "กู้คืนแชท"}
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/20">
            {messages.length === 0 && !showProfile && (
              <p className="text-center text-xs text-muted-foreground pt-12">
                สวัสดีค่ะ! มีอะไรให้ช่วยไหม 🌾
              </p>
            )}
            {messages.map((m: any) => (
              <div key={m.id} className={`flex ${m.sender_type === "customer" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                    m.sender_type === "customer"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card text-foreground rounded-bl-md border border-border"
                  }`}
                >
                  {m.message}
                  <p className={`text-[10px] mt-1 opacity-70`}>
                    {new Date(m.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  </p>
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
