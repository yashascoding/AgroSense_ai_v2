import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Send } from "lucide-react";
import { getApiBase } from "@/lib/api-base";

type Msg = { role: "user" | "assistant"; text: string };

type Props = {
  file: File;
};

export function GeminiChatPanel({ file }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("message", text);
      fd.append("image", file, file.name);
      const res = await fetch(`${getApiBase()}/chat/gemini`, { method: "POST", body: fd });
      const rawText = await res.text();
      let data = {} as { reply?: string; error?: string };
      try {
        if (rawText) data = JSON.parse(rawText) as typeof data;
      } catch {
        throw new Error("Invalid server response.");
      }
      if (!res.ok) {
        throw new Error(data.error || "Chat failed.");
      }
      const reply = (data.reply ?? "").trim() || "(No reply)";
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: e instanceof Error ? e.message : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass-card rounded-2xl border border-border/60 h-[min(520px,70vh)] flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-display">Ask about this crop</CardTitle>
        <p className="text-xs text-muted-foreground">
          Chat uses Gemini with the same image you uploaded
        </p>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 gap-3 pt-0">
        <ScrollArea className="flex-1 pr-3 -mr-1 min-h-[200px]">
          <div className="space-y-3 text-sm">
            {messages.length === 0 && (
              <p className="text-muted-foreground text-xs">
                Ask about symptoms, care, or what you see in the photo.
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={
                  msg.role === "user"
                    ? "ml-4 rounded-xl bg-primary/10 px-3 py-2 text-foreground"
                    : "mr-4 rounded-xl bg-muted/80 px-3 py-2 text-foreground whitespace-pre-wrap"
                }
              >
                {msg.text}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question…"
            className="min-h-[72px] rounded-xl resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={loading}
          />
          <Button
            type="button"
            size="icon"
            className="shrink-0 rounded-xl h-[72px] w-12"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
