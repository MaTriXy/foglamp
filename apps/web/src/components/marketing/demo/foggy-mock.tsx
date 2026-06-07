"use client";

import { Button } from "@foglamp/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@foglamp/ui/components/empty";
import { TextShimmerLoader } from "@foglamp/ui/components/loader";
import { cn } from "@foglamp/ui/lib/utils";
import {
  IconArrowUp,
  IconMessageFilled,
  IconPacmanFilled,
  IconPlus,
  IconTool,
  IconX,
} from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

import { markdownComponents } from "@/components/app/markdown";

import { FOGGY_SCRIPT, type FoggyTurn } from "./mock-data";

// A scripted, fully local stand-in for the real <FoggyWidget> (which is wired to
// useChat + the /foggy server route). Same shapes and motion, but the "model"
// is just FOGGY_SCRIPT: pick a turn, show a "looking up …" tool chip, then
// stream the canned answer word-by-word. No network, no tRPC.

type Msg = {
  id: number;
  role: "user" | "assistant";
  text: string;
  tool?: string;
  toolDone?: boolean;
};

type Status = "idle" | "thinking" | "streaming";

const SUGGESTIONS = FOGGY_SCRIPT.map((t) => t.question);

// A subtle pill mirroring foggy-message's ToolChip — Foggy reaching into data.
function ToolChip({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex w-fit items-center gap-1.5 py-1 pl-3 text-xs text-muted-foreground">
      <IconTool className={cn("size-3 shrink-0 fill-current stroke-0", !done && "animate-pulse")} />
      {done ? "Looked up" : "Looking up"} {label}
    </div>
  );
}

export function FoggyMock() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<Status>("idle");

  const idRef = useRef(0);
  const seqRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const nextId = () => ++idRef.current;
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  // Clear pending timers on unmount so a streaming answer can't update after.
  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  // Exact-match a scripted question; otherwise hand back the next turn in order
  // so any free-typed input still gets a sensible canned reply.
  function pickTurn(text: string): FoggyTurn {
    const match = FOGGY_SCRIPT.find((t) => t.question.toLowerCase() === text.toLowerCase());
    if (match) return match;
    const turn = FOGGY_SCRIPT[seqRef.current % FOGGY_SCRIPT.length]!;
    seqRef.current += 1;
    return turn;
  }

  function streamAnswer(aId: number, answer: string) {
    const tokens = answer.match(/\S+\s*/g) ?? [answer];
    let i = 0;
    setStatus("streaming");
    const step = () => {
      i += 1;
      const partial = tokens.slice(0, i).join("");
      setMessages((m) =>
        m.map((msg) => (msg.id === aId ? { ...msg, text: partial } : msg)),
      );
      if (i < tokens.length) {
        timers.current.push(setTimeout(step, 26));
      } else {
        setStatus("idle");
      }
    };
    step();
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || status !== "idle") return;
    const turn = pickTurn(trimmed);
    const aId = nextId();
    setInput("");
    setMessages((m) => [...m, { id: nextId(), role: "user", text: trimmed }]);
    setStatus("thinking");

    timers.current.push(
      setTimeout(() => {
        setMessages((m) => [
          ...m,
          { id: aId, role: "assistant", text: "", tool: turn.tool, toolDone: !turn.tool },
        ]);
        if (turn.tool) {
          timers.current.push(
            setTimeout(() => {
              setMessages((m) =>
                m.map((msg) => (msg.id === aId ? { ...msg, toolDone: true } : msg)),
              );
              timers.current.push(setTimeout(() => streamAnswer(aId, turn.answer), 350));
            }, 1000),
          );
        } else {
          timers.current.push(setTimeout(() => streamAnswer(aId, turn.answer), 250));
        }
      }, 600),
    );
  }

  function newChat() {
    clearTimers();
    setMessages([]);
    setInput("");
    setStatus("idle");
  }

  const thinking = status === "thinking";

  return (
    <>
      {/* Launcher — simplified bottom-right button (no carved SVG notch). */}
      <AnimatePresence>
        {!open && (
          <motion.div
            key="foggy-launcher"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute bottom-4 right-4 z-40"
          >
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setOpen(true)}
              aria-label="Ask Foggy"
              className="rounded-2xl corner-squircle shadow-(--custom-shadow)"
            >
              <IconPacmanFilled className="size-4 text-[#0090FD]" />
              Ask Foggy
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel — floats over the inset (the demo frame is a fixed-size box,
          so this is an overlay rather than a width-animated flex sibling). */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="foggy-panel"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-y-3 right-3 z-40 flex w-[min(360px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-3xl corner-squircle bg-background shadow-[0_1px_0_0_var(--border),0_24px_60px_-24px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <IconPacmanFilled className="size-4 text-[#0090FD]" />
                Foggy
              </div>
              <div className="flex items-center gap-1">
                <AnimatePresence initial={false}>
                  {messages.length > 0 && (
                    <motion.div
                      key="new-chat"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={newChat}
                        aria-label="New chat"
                        title="New chat"
                      >
                        <IconPlus className="size-4" />
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <IconX className="size-4" />
                </Button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1">
              <div ref={scrollRef} className="no-scrollbar h-full overflow-y-auto px-2 py-4">
                {messages.length === 0 ? (
                  <Empty className="h-full border-0 p-0">
                    <EmptyHeader>
                      <EmptyMedia
                        variant="icon"
                        className="size-9 corner-squircle rounded-2xl bg-[#0090FD]/10 text-[#0090FD] shadow-[inset_0_0_0_1px_rgba(0,144,253,0.14),0_2px_6px_-2px_rgba(0,144,253,0.25)] [&_svg:not([class*='size-'])]:size-5 dark:bg-[#0090FD]/15 dark:shadow-(--custom-shadow)"
                      >
                        <IconPacmanFilled className="size-6 text-[#0090FD]" />
                      </EmptyMedia>
                      <EmptyTitle>Ask Foggy</EmptyTitle>
                      <EmptyDescription>
                        I can dig through this project&apos;s traces, costs, and agents — or explain
                        how Foglamp works.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent className="mt-2 gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => send(s)}
                          className="flex w-fit cursor-pointer items-center justify-center gap-2 rounded-xl corner-squircle px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <IconMessageFilled className="size-3.5 text-muted-foreground/50" />
                          {s}
                        </button>
                      ))}
                    </EmptyContent>
                  </Empty>
                ) : (
                  <div className="flex flex-col gap-6">
                    {messages.map((m) =>
                      m.role === "user" ? (
                        <div key={m.id} className="flex flex-col items-end gap-1.5">
                          <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl corner-squircle bg-muted px-3 py-2 text-sm text-primary">
                            {m.text}
                          </div>
                        </div>
                      ) : (
                        <div key={m.id} className="flex flex-col items-start gap-1.5">
                          {m.tool && <ToolChip label={m.tool} done={!!m.toolDone} />}
                          {m.text && (
                            <div className="max-w-[90%] px-3 py-0 text-sm leading-relaxed [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 *:first:mt-0 *:last:mb-0">
                              <Streamdown components={markdownComponents} controls={{ table: false }}>
                                {m.text}
                              </Streamdown>
                            </div>
                          )}
                        </div>
                      ),
                    )}
                    {thinking && (
                      <TextShimmerLoader text="Foggy is thinking…" size="sm" className="pl-4" />
                    )}
                  </div>
                )}
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-background via-background/50 to-transparent"
                style={{
                  maskImage: "linear-gradient(to top, black 35%, transparent)",
                  WebkitMaskImage: "linear-gradient(to top, black 35%, transparent)",
                }}
              />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="relative flex items-end gap-2 p-2 pt-0"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={2}
                placeholder="Ask Foggy…"
                className="max-h-32 flex-1 resize-none rounded-4xl corner-squircle bg-background p-4 text-sm shadow-(--custom-shadow) outline-none transition-colors focus-visible:border-ring dark:bg-muted/30"
              />
              <Button
                type="submit"
                size="icon-xs"
                disabled={!input.trim() || status !== "idle"}
                aria-label="Send"
                className="absolute bottom-5 right-5"
              >
                <IconArrowUp className="size-4" />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
