"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { sendTestEmailAction } from "@/app/actions";

type Message = { type: "success" | "error"; text: string };

// Toolbar actions use document.execCommand — deprecated but universally
// supported and dependency-free, which is plenty for a test-email composer.
const TOOLS: { cmd: string; label: string; title: string; value?: string }[] = [
  { cmd: "bold", label: "B", title: "Bold" },
  { cmd: "italic", label: "I", title: "Italic" },
  { cmd: "underline", label: "U", title: "Underline" },
  { cmd: "insertUnorderedList", label: "• List", title: "Bulleted list" },
  { cmd: "insertOrderedList", label: "1. List", title: "Numbered list" },
];

export function TestEmailComposer({ defaultTo = "" }: { defaultTo?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState("OrderDesk test email");
  const [sending, setSending] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    syncEmpty();
  };

  const insertLink = () => {
    const url = window.prompt("Link URL:", "https://");
    if (url) exec("createLink", url);
  };

  const syncEmpty = () => {
    const text = editorRef.current?.textContent?.trim() ?? "";
    setIsEmpty(text.length === 0);
  };

  const handleSend = async () => {
    const html = editorRef.current?.innerHTML ?? "";
    const bodyText = editorRef.current?.textContent?.trim() ?? "";

    if (!to.trim()) {
      setMessage({ type: "error", text: "Enter a recipient email address." });
      return;
    }
    if (!bodyText) {
      setMessage({ type: "error", text: "Write a message before sending." });
      return;
    }

    setSending(true);
    setMessage(null);

    const formData = new FormData();
    formData.set("to", to.trim());
    formData.set("subject", subject);
    formData.set("html", html);

    try {
      await sendTestEmailAction(formData);
      setMessage({ type: "success", text: `Test email sent to ${to.trim()}. Check the inbox (and spam).` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to send test email.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-md border px-4 py-2.5 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">To</label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
        <div className="rounded-md border border-slate-200 overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
            {TOOLS.map((tool) => (
              <button
                key={tool.cmd}
                type="button"
                title={tool.title}
                onMouseDown={(e) => e.preventDefault()} // keep selection in the editor
                onClick={() => exec(tool.cmd, tool.value)}
                className="min-w-[2rem] rounded px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                {tool.label}
              </button>
            ))}
            <button
              type="button"
              title="Insert link"
              onMouseDown={(e) => e.preventDefault()}
              onClick={insertLink}
              className="rounded px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              🔗 Link
            </button>
            <button
              type="button"
              title="Clear formatting"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec("removeFormat")}
              className="rounded px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Clear
            </button>
          </div>

          {/* Editable area */}
          <div className="relative">
            {isEmpty && (
              <span className="pointer-events-none absolute left-3 top-2 text-sm text-slate-400">
                Write your test message…
              </span>
            )}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncEmpty}
              className="min-h-[140px] px-3 py-2 text-sm text-slate-800 outline-none [&_a]:text-indigo-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
            />
          </div>
        </div>
      </div>

      <Button type="button" onClick={handleSend} disabled={sending}>
        {sending ? "Sending..." : "Send test email"}
      </Button>
    </div>
  );
}
