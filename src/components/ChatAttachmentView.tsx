import { FileText, Download } from "lucide-react";

export function ChatAttachmentView({ url, type, name }: { url: string; type?: string | null; name?: string | null }) {
  if (!url) return null;
  if (type === "image") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img src={url} alt={name || "image"} className="max-h-48 max-w-full rounded-lg border border-border" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-flex items-center gap-2 bg-background/40 border border-border rounded-lg px-2 py-1.5 text-xs hover:bg-background/60"
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate max-w-[150px]">{name || "ไฟล์แนบ"}</span>
      <Download className="h-3 w-3 opacity-60" />
    </a>
  );
}
