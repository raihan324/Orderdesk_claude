"use client";

import { useRef, useState } from "react";
import {
  Mail, X, Braces, ChevronDown, Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link2, Link2Off, Table as TableIcon, Image as ImageIcon, Minus,
  Paperclip, IndentIncrease, IndentDecrease, Quote, Eraser, Palette, Highlighter,
} from "lucide-react";
import { Button } from "@/components/ui";
import { sendEmailAction } from "@/app/actions";

type Message = { type: "success" | "error"; text: string };

/** A record-level merge field the user can insert into the subject/body as `{{key}}`. */
export type MailVariable = { key: string; label: string; value: string };

/** A pre-known recipient (e.g. a client contact) offered in the To dropdown. */
export type MailRecipient = { email: string; name?: string; label?: string };

type Attachment = { id: string; filename: string; contentType: string; size: number; contentBase64: string };

const CUSTOM = "__custom__";
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Advanced "Send mail" composer (Zoho-style): To / Cc / Bcc, subject, a full
 * rich-text toolbar (fonts, sizes, headings, colors, alignment, lists, links,
 * tables, images, horizontal rules), file attachments, and record-level
 * `{{variable}}` merge fields. Sends through the signed-in user's mailbox.
 *
 * Backward-compatible: `variables` and `recipients` are optional.
 */
export function SendMailButton({
  to = "",
  subjectDefault = "",
  label = "Send mail",
  variables = [],
  recipients = [],
}: {
  to?: string;
  subjectDefault?: string;
  label?: string;
  variables?: MailVariable[];
  recipients?: MailRecipient[];
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);

  const [recipient, setRecipient] = useState(to);
  const [useCustom, setUseCustom] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(subjectDefault);

  const [showVars, setShowVars] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [tableHover, setTableHover] = useState({ r: 0, c: 0 });
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inList = (email: string) => recipients.some((r) => r.email === email);

  const launch = () => {
    let initial = to;
    let custom = recipients.length === 0;
    if (recipients.length > 0) {
      if (inList(to)) custom = false;
      else if (to) custom = true;
      else {
        initial = recipients[0].email;
        custom = false;
      }
    }
    setRecipient(initial);
    setUseCustom(custom);
    setCc("");
    setBcc("");
    setShowCc(false);
    setShowBcc(false);
    setSubject(subjectDefault);
    setMessage(null);
    setIsEmpty(true);
    setShowVars(false);
    setShowTable(false);
    setAttachments([]);
    savedRange.current = null;
    setOpen(true);
  };

  // --- selection helpers -------------------------------------------------
  const saveRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const runWithSelection = (fn: () => void) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && savedRange.current && el.contains(savedRange.current.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    fn();
    const after = window.getSelection();
    savedRange.current = after && after.rangeCount > 0 ? after.getRangeAt(0).cloneRange() : null;
    setIsEmpty(!el.textContent?.trim());
  };

  // Simple inline commands keep the selection via onMouseDown preventDefault.
  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    setIsEmpty(!editorRef.current?.textContent?.trim());
  };

  const insertHTML = (html: string) => runWithSelection(() => document.execCommand("insertHTML", false, html));

  // For toolbar <select>s, which blur the editor: restore the saved range first.
  const execSel = (cmd: string, value: string) => runWithSelection(() => document.execCommand(cmd, false, value));

  const applyColor = (cmd: "foreColor" | "hiliteColor", value: string) =>
    runWithSelection(() => {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(cmd, false, value);
    });

  const addLink = () => {
    const url = window.prompt("Link URL", "https://");
    if (url) runWithSelection(() => document.execCommand("createLink", false, url));
  };

  const addImage = () => {
    const url = window.prompt("Image URL", "https://");
    if (url) insertHTML(`<img src="${url}" alt="" style="max-width:100%;height:auto" />`);
  };

  const insertTable = (rows: number, cols: number) => {
    const cell = '<td style="border:1px solid #cbd5e1;padding:6px 8px;min-width:48px">&nbsp;</td>';
    const row = `<tr>${cell.repeat(cols)}</tr>`;
    insertHTML(
      `<table style="border-collapse:collapse;width:100%;margin:8px 0" border="1">${row.repeat(rows)}</table><p><br/></p>`,
    );
    setShowTable(false);
  };

  // --- variables ---------------------------------------------------------
  const selectedName = recipients.find((r) => r.email === recipient)?.name ?? "";

  const varItems: MailVariable[] = [
    ...variables,
    ...(recipients.length > 0
      ? [
          { key: "recipient.name", label: "Recipient name", value: selectedName },
          { key: "recipient.email", label: "Recipient email", value: recipient },
        ]
      : []),
  ];

  const insertVar = (key: string) => {
    insertHTML(`{{${key}}}`);
    setShowVars(false);
  };

  const fillTokens = (text: string) => {
    const map: Record<string, string> = {};
    for (const v of variables) map[v.key] = v.value;
    map["recipient.email"] = recipient.trim();
    map["recipient.name"] = selectedName || recipient.trim().split("@")[0] || "";
    return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => (k in map ? map[k] : m));
  };

  // --- attachments -------------------------------------------------------
  const readFile = (file: File) =>
    new Promise<Attachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result);
        resolve({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          contentBase64: result.includes(",") ? result.slice(result.indexOf(",") + 1) : result,
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const onFilesChosen = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const read = await Promise.all(Array.from(files).map(readFile));
      setAttachments((prev) => {
        const merged = [...prev];
        for (const a of read) if (!merged.some((m) => m.id === a.id)) merged.push(a);
        const total = merged.reduce((s, a) => s + a.size, 0);
        if (total > MAX_TOTAL_BYTES) {
          setMessage({ type: "error", text: "Attachments exceed the 20MB total limit." });
          return prev;
        }
        setMessage(null);
        return merged;
      });
    } catch {
      setMessage({ type: "error", text: "Could not read one of the files." });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  // --- send --------------------------------------------------------------
  const handleSend = async () => {
    if (!recipient.trim()) {
      setMessage({ type: "error", text: "Enter a recipient." });
      return;
    }
    if (!editorRef.current?.textContent?.trim() && attachments.length === 0) {
      setMessage({ type: "error", text: "Write a message." });
      return;
    }
    setSending(true);
    setMessage(null);
    const fd = new FormData();
    fd.set("to", recipient.trim());
    if (cc.trim()) fd.set("cc", cc.trim());
    if (bcc.trim()) fd.set("bcc", bcc.trim());
    fd.set("subject", fillTokens(subject.trim() || "(no subject)"));
    fd.set("html", fillTokens(editorRef.current?.innerHTML ?? ""));
    if (attachments.length > 0) {
      fd.set(
        "attachments",
        JSON.stringify(
          attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, contentBase64: a.contentBase64 })),
        ),
      );
    }
    try {
      await sendEmailAction(fd);
      setMessage({ type: "success", text: `Sent to ${recipient.trim()}.` });
      if (editorRef.current) editorRef.current.innerHTML = "";
      setIsEmpty(true);
      setAttachments([]);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to send." });
    } finally {
      setSending(false);
    }
  };

  const totalBytes = attachments.reduce((s, a) => s + a.size, 0);

  return (
    <>
      <Button type="button" variant="outline" onClick={launch}>
        <Mail size={14} /> {label}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="my-6 w-full max-w-2xl rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Mail size={15} /> Send email</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
            </div>

            <div className="space-y-3 p-5">
              {message && (
                <div className={`rounded-md border px-4 py-2 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                  {message.text}
                </div>
              )}

              {/* To + Cc/Bcc toggles */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-600">To</label>
                  <div className="flex gap-2 text-xs">
                    {!showCc && <button type="button" onClick={() => setShowCc(true)} className="font-medium text-indigo-600 hover:text-indigo-700">Cc</button>}
                    {!showBcc && <button type="button" onClick={() => setShowBcc(true)} className="font-medium text-indigo-600 hover:text-indigo-700">Bcc</button>}
                  </div>
                </div>
                {recipients.length > 0 && !useCustom ? (
                  <select
                    value={recipient}
                    onChange={(e) => {
                      if (e.target.value === CUSTOM) { setUseCustom(true); setRecipient(""); }
                      else setRecipient(e.target.value);
                    }}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    {recipients.map((r) => (
                      <option key={r.email} value={r.email}>{r.label ?? (r.name ? `${r.name} — ${r.email}` : r.email)}</option>
                    ))}
                    <option value={CUSTOM}>Custom address…</option>
                  </select>
                ) : (
                  <>
                    <input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="recipient@example.com" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                    {recipients.length > 0 && (
                      <button type="button" onClick={() => { setUseCustom(false); setRecipient(recipients[0].email); }} className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">← Choose from contacts</button>
                    )}
                  </>
                )}
              </div>

              {showCc && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Cc</label>
                  <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="comma-separated emails" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                </div>
              )}
              {showBcc && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Bcc</label>
                  <input type="text" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="comma-separated emails" className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Subject</label>
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
              </div>

              {/* Editor */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Message</label>
                <div className="rounded-md border border-slate-200">
                  <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
                    {/* paragraph format */}
                    <select
                      onChange={(e) => { execSel("formatBlock", e.target.value); e.target.selectedIndex = 0; }}
                      defaultValue=""
                      className="mr-1 rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-700"
                      title="Paragraph style"
                    >
                      <option value="" disabled>Style</option>
                      <option value="P">Normal</option>
                      <option value="H1">Heading 1</option>
                      <option value="H2">Heading 2</option>
                      <option value="H3">Heading 3</option>
                      <option value="BLOCKQUOTE">Quote</option>
                      <option value="PRE">Code</option>
                    </select>
                    {/* font family */}
                    <select
                      onChange={(e) => { execSel("fontName", e.target.value); e.target.selectedIndex = 0; }}
                      defaultValue=""
                      className="mr-1 rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-700"
                      title="Font"
                    >
                      <option value="" disabled>Font</option>
                      <option value="Arial, sans-serif">Sans</option>
                      <option value="Georgia, serif">Serif</option>
                      <option value="'Courier New', monospace">Mono</option>
                    </select>
                    {/* font size */}
                    <select
                      onChange={(e) => { execSel("fontSize", e.target.value); e.target.selectedIndex = 0; }}
                      defaultValue=""
                      className="mr-1 rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-700"
                      title="Size"
                    >
                      <option value="" disabled>Size</option>
                      <option value="2">Small</option>
                      <option value="3">Normal</option>
                      <option value="5">Large</option>
                      <option value="7">Huge</option>
                    </select>

                    <Sep />
                    <Tb onClick={() => exec("bold")} title="Bold"><Bold size={15} /></Tb>
                    <Tb onClick={() => exec("italic")} title="Italic"><Italic size={15} /></Tb>
                    <Tb onClick={() => exec("underline")} title="Underline"><Underline size={15} /></Tb>
                    <Tb onClick={() => exec("strikeThrough")} title="Strikethrough"><Strikethrough size={15} /></Tb>

                    {/* colors */}
                    <label onMouseDown={saveRange} title="Text color" className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded text-slate-700 hover:bg-slate-200">
                      <Palette size={15} />
                      <input type="color" defaultValue="#0f172a" onChange={(e) => applyColor("foreColor", e.target.value)} className="absolute inset-0 h-0 w-0 opacity-0" />
                    </label>
                    <label onMouseDown={saveRange} title="Highlight" className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded text-slate-700 hover:bg-slate-200">
                      <Highlighter size={15} />
                      <input type="color" defaultValue="#fef08a" onChange={(e) => applyColor("hiliteColor", e.target.value)} className="absolute inset-0 h-0 w-0 opacity-0" />
                    </label>

                    <Sep />
                    <Tb onClick={() => exec("justifyLeft")} title="Align left"><AlignLeft size={15} /></Tb>
                    <Tb onClick={() => exec("justifyCenter")} title="Align center"><AlignCenter size={15} /></Tb>
                    <Tb onClick={() => exec("justifyRight")} title="Align right"><AlignRight size={15} /></Tb>
                    <Tb onClick={() => exec("justifyFull")} title="Justify"><AlignJustify size={15} /></Tb>

                    <Sep />
                    <Tb onClick={() => exec("insertUnorderedList")} title="Bulleted list"><List size={15} /></Tb>
                    <Tb onClick={() => exec("insertOrderedList")} title="Numbered list"><ListOrdered size={15} /></Tb>
                    <Tb onClick={() => exec("outdent")} title="Decrease indent"><IndentDecrease size={15} /></Tb>
                    <Tb onClick={() => exec("indent")} title="Increase indent"><IndentIncrease size={15} /></Tb>
                    <Tb onClick={() => exec("formatBlock", "BLOCKQUOTE")} title="Quote"><Quote size={15} /></Tb>

                    <Sep />
                    <Tb onClick={addLink} title="Insert link" keep={false}><Link2 size={15} /></Tb>
                    <Tb onClick={() => exec("unlink")} title="Remove link"><Link2Off size={15} /></Tb>
                    <Tb onClick={addImage} title="Insert image (URL)" keep={false}><ImageIcon size={15} /></Tb>
                    <Tb onClick={() => exec("insertHorizontalRule")} title="Horizontal line"><Minus size={15} /></Tb>

                    {/* table picker */}
                    <div className="relative">
                      <Tb onClick={() => setShowTable((v) => !v)} title="Insert table" keep={false}><TableIcon size={15} /></Tb>
                      {showTable && (
                        <div className="absolute left-0 z-10 mt-1 rounded-md border border-slate-200 bg-white p-2 shadow-lg" onMouseLeave={() => setTableHover({ r: 0, c: 0 })}>
                          <div className="grid grid-cols-8 gap-0.5">
                            {Array.from({ length: 6 }).map((_, ri) =>
                              Array.from({ length: 8 }).map((_, ci) => (
                                <button
                                  key={`${ri}-${ci}`}
                                  type="button"
                                  onMouseEnter={() => setTableHover({ r: ri + 1, c: ci + 1 })}
                                  onClick={() => insertTable(ri + 1, ci + 1)}
                                  className={`h-4 w-4 rounded-[2px] border ${ri < tableHover.r && ci < tableHover.c ? "border-indigo-400 bg-indigo-200" : "border-slate-200 bg-slate-50"}`}
                                />
                              )),
                            )}
                          </div>
                          <p className="mt-1 text-center text-[11px] text-slate-500">{tableHover.r > 0 ? `${tableHover.r} × ${tableHover.c}` : "Pick size"}</p>
                        </div>
                      )}
                    </div>

                    <Tb onClick={() => exec("removeFormat")} title="Clear formatting"><Eraser size={15} /></Tb>

                    {/* attachments */}
                    <Tb onClick={() => fileInputRef.current?.click()} title="Attach files" keep={false}><Paperclip size={15} /></Tb>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => onFilesChosen(e.target.files)} />

                    {/* variables */}
                    {varItems.length > 0 && (
                      <div className="relative ml-auto">
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowVars((v) => !v)} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
                          <Braces size={13} /> Variable <ChevronDown size={12} />
                        </button>
                        {showVars && (
                          <div className="absolute right-0 z-10 mt-1 max-h-64 w-60 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                            {varItems.map((v) => (
                              <button key={v.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(v.key)} className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-slate-50">
                                <span className="text-sm text-slate-700">{v.label}</span>
                                <span className="font-mono text-[11px] text-slate-400">{`{{${v.key}}}`}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    {isEmpty && <span className="pointer-events-none absolute left-3 top-2 text-sm text-slate-400">Write your message…</span>}
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={() => setIsEmpty(!editorRef.current?.textContent?.trim())}
                      onKeyUp={saveRange}
                      onMouseUp={saveRange}
                      onBlur={saveRange}
                      className="min-h-[180px] max-h-[40vh] overflow-y-auto px-3 py-2 text-sm text-slate-800 outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_a]:text-indigo-600 [&_a]:underline [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-1.5 [&_pre]:rounded [&_pre]:bg-slate-100 [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs"
                    />
                  </div>
                </div>
                {varItems.length > 0 && (
                  <p className="mt-1 text-xs text-slate-400">Variables insert at the cursor and also work when typed in the subject — filled in when sent.</p>
                )}
              </div>

              {/* attachment chips */}
              {attachments.length > 0 && (
                <div className="space-y-1">
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((a) => (
                      <span key={a.id} className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                        <Paperclip size={12} className="text-slate-400" />
                        <span className="max-w-[160px] truncate">{a.filename}</span>
                        <span className="text-slate-400">{formatBytes(a.size)}</span>
                        <button type="button" onClick={() => removeAttachment(a.id)} className="text-slate-400 hover:text-rose-600"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400">{formatBytes(totalBytes)} of 20 MB</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" onClick={handleSend} disabled={sending}>{sending ? "Sending…" : "Send"}</Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Toolbar button. `keep` (default true) preserves the editor selection on click. */
function Tb({ onClick, title, children, keep = true }: { onClick: () => void; title: string; children: React.ReactNode; keep?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={keep ? (e) => e.preventDefault() : undefined}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded text-slate-700 hover:bg-slate-200"
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px bg-slate-200" />;
}
