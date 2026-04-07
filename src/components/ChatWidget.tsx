import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send } from "lucide-react";

type ChatMessage = {
  id: string;
  order_id: string;
  sender_type: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState<{ id: string; customer_name: string }[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [step, setStep] = useState<"phone" | "orders" | "chat">("phone");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedOrder) return;
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("order_id", selectedOrder)
        .order("created_at");
      if (data) setMessages(data);
    };
    fetchMessages();

    const channel = supabase
      .channel(`chat-${selectedOrder}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `order_id=eq.${selectedOrder}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedOrder]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const searchOrders = async () => {
    if (!phone.trim()) return;
    const { data } = await supabase
      .from("orders")
      .select("id, customer_name")
      .eq("customer_phone", phone.trim())
      .order("created_at", { ascending: false })
      .limit(10);
    if (data && data.length > 0) {
      setOrders(data);
      setStep("orders");
    }
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedOrder) return;
    await supabase.from("chat_messages").insert({
      order_id: selectedOrder,
      sender_type: "customer",
      message: newMsg.trim(),
    });
    setNewMsg("");
  };

  const reset = () => {
    setStep("phone");
    setSelectedOrder(null);
    setMessages([]);
    setOrders([]);
    setPhone("");
  };

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-80 h-[28rem] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
            <p className="font-semibold text-sm">💬 แชทกับร้าน</p>
            <div className="flex gap-1">
              {step !== "phone" && (
                <button onClick={reset} className="text-xs opacity-80 hover:opacity-100 mr-2">← กลับ</button>
              )}
              <button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {step === "phone" && (
              <div className="space-y-3 pt-4">
                <p className="text-sm text-muted-foreground text-center">กรอกเบอร์โทรที่ใช้สั่งซื้อ</p>
                <Input
                  className="rounded-xl"
                  placeholder="08x-xxx-xxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchOrders()}
                />
                <Button className="w-full rounded-xl" onClick={searchOrders}>ค้นหาออเดอร์</Button>
              </div>
            )}

            {step === "orders" && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-muted-foreground">เลือกออเดอร์ที่ต้องการแชท:</p>
                {orders.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => { setSelectedOrder(o.id); setStep("chat"); }}
                    className="w-full text-left p-3 bg-muted/50 hover:bg-muted rounded-xl text-sm transition-colors"
                  >
                    <p className="font-medium text-foreground">{o.customer_name}</p>
                    <p className="text-xs text-muted-foreground">#{o.id.slice(0, 8)}</p>
                  </button>
                ))}
              </div>
            )}

            {step === "chat" && (
              <>
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender_type === "customer" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                      m.sender_type === "customer"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}>
                      {m.message}
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground pt-8">เริ่มแชทกับร้านได้เลย!</p>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Input */}
          {step === "chat" && (
            <div className="p-3 border-t border-border flex gap-2">
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
          )}
        </div>
      )}
    </>
  );
}
