import { supabase } from "@/integrations/supabase/client";

export type ChatAttachment = {
  url: string;
  type: "image" | "file";
  name: string;
};

const BUCKET = "chat-uploads";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function uploadChatFile(file: File, sessionId: string): Promise<ChatAttachment | null> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("ไฟล์ใหญ่เกิน 10MB");
  }
  const ext = file.name.split(".").pop() || "bin";
  const path = `${sessionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, ONE_YEAR);
  if (signErr || !signed) throw signErr || new Error("ไม่สามารถสร้างลิงก์ได้");
  return {
    url: signed.signedUrl,
    type: file.type.startsWith("image/") ? "image" : "file",
    name: file.name,
  };
}
