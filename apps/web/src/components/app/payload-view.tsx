"use client";

import { cn } from "@foglamp/ui/lib/utils";
import { IconChevronRight, IconTool } from "@tabler/icons-react";
import { useState } from "react";
import { Streamdown } from "streamdown";

import { useShikiHtml } from "./code-block";
import { markdownComponents } from "./markdown";

// Renders a span/trace input or output payload readably instead of as raw JSON.
// These payloads are AI-SDK shapes: an array of `{role, content}` messages, a
// bare array of content parts, or a plain (markdown) string. We normalize all
// three to messages → parts, render text as markdown, and tuck tool calls /
// results behind a disclosure. Anything we don't recognize falls back to JSON.

type Part =
	| { kind: "text"; text: string }
	| { kind: "tool-call"; name: string; data: unknown }
	| { kind: "tool-result"; name: string; data: unknown }
	| { kind: "json"; data: unknown };

type Message = { role: string | null; parts: Part[] };

function partFrom(p: unknown): Part {
	if (typeof p === "string") return { kind: "text", text: p };
	if (p && typeof p === "object") {
		const o = p as Record<string, unknown>;
		if (
			(o.type === "text" || o.type === "reasoning") &&
			typeof o.text === "string"
		) {
			return { kind: "text", text: o.text };
		}
		if (o.type === "tool-call") {
			return {
				kind: "tool-call",
				name: String(o.toolName ?? o.name ?? "tool"),
				data: o.input ?? o.args ?? {},
			};
		}
		if (o.type === "tool-result") {
			return {
				kind: "tool-result",
				name: String(o.toolName ?? o.name ?? "tool"),
				data: o.output ?? o.result ?? {},
			};
		}
	}
	return { kind: "json", data: p };
}

function partsFrom(content: unknown): Part[] {
	if (typeof content === "string") return [{ kind: "text", text: content }];
	if (Array.isArray(content)) return content.map(partFrom);
	if (content == null) return [];
	return [partFrom(content)];
}

/** Normalize a payload string to a list of messages, or null when it isn't JSON
 * (e.g. a plain markdown answer — rendered as a single roleless block). */
function toMessages(value: string): Message[] | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return null;
	}
	const items = Array.isArray(parsed) ? parsed : [parsed];
	const hasRoles = items.some(
		(m) => m && typeof m === "object" && "role" in (m as object),
	);
	if (hasRoles) {
		return items.map((m) => {
			const o = (m ?? {}) as Record<string, unknown>;
			return {
				role: typeof o.role === "string" ? o.role : null,
				parts: partsFrom(o.content),
			};
		});
	}
	// A bare array of parts (typical for assistant output) → one roleless block.
	return [{ role: null, parts: items.map(partFrom) }];
}

function stringify(data: unknown): string {
	try {
		return JSON.stringify(data, null, 2);
	} catch {
		return String(data);
	}
}

// A scrollable raw-JSON block with Shiki syntax highlighting (shares the lazy
// singleton highlighter with CodeBlock). Until the async highlighter resolves —
// or if it fails — the plain text renders as a fallback so there's never an
// empty flash. `className` styles the outer container (border/bg/rounding); the
// highlighted `<pre>` is made transparent so that container shows through.
function JsonBlock({
	data,
	className,
}: {
	data: unknown;
	className?: string;
}) {
	const code = stringify(data);
	const html = useShikiHtml(code, "json");
	const base = "max-h-56 overflow-x-hidden overflow-y-auto p-2 text-xs";
	if (!html) {
		return (
			<pre className={cn(base, "whitespace-pre-wrap wrap-anywhere", className)}>
				{code}
			</pre>
		);
	}
	return (
		<div
			className={cn(
				base,
				"[&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:whitespace-pre-wrap [&_pre]:wrap-anywhere",
				className,
			)}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki output
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}

// Prose wrapper matching the chat transcript spacing, so markdown reads the
// same here as in sessions / Foggy.
function Prose({ children }: { children: string }) {
	return (
		<div className="text-sm leading-relaxed text-balance wrap-anywhere [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:whitespace-pre-wrap [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 *:last:mb-0 [&>*:first-child]:mt-0">
			<Streamdown components={markdownComponents} controls={{ table: false }}>
				{children}
			</Streamdown>
		</div>
	);
}

function ToolPart({
	kind,
	name,
	data,
}: {
	kind: "tool-call" | "tool-result";
	name: string;
	data: unknown;
}) {
	const [open, setOpen] = useState(false);
	const label = kind === "tool-call" ? "calls" : "returns";
	return (
		<div className="rounded-lg border border-border/60 bg-background/50">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
			>
				<IconChevronRight
					className={cn(
						"size-3.5 shrink-0 transition-transform",
						open && "rotate-90",
					)}
				/>
				<IconTool className="size-3.5 shrink-0" />
				<span className="text-muted-foreground/70">{label}</span>
				<span className="truncate font-medium text-foreground">{name}</span>
			</button>
			{open && <JsonBlock data={data} className="border-t border-border/60" />}
		</div>
	);
}

function PartView({ part }: { part: Part }) {
	switch (part.kind) {
		case "text":
			return part.text.trim() ? <Prose>{part.text}</Prose> : null;
		case "tool-call":
		case "tool-result":
			return <ToolPart kind={part.kind} name={part.name} data={part.data} />;
		default:
			return <JsonBlock data={part.data} className="rounded-lg bg-muted" />;
	}
}

function MessageBlock({ message }: { message: Message }) {
	return (
		<div className="flex flex-col gap-1.5">
			{message.role && (
				<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
					{message.role}
				</span>
			)}
			{message.parts.map((part, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and static
				<PartView key={i} part={part} />
			))}
		</div>
	);
}

export function PayloadView({
	value,
	className,
}: {
	value: string;
	className?: string;
}) {
	const messages = toMessages(value);
	if (!messages) {
		// Not JSON — a plain (markdown) answer.
		return (
			<div className={className}>
				<Prose>{value}</Prose>
			</div>
		);
	}
	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{messages.map((message, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: messages are positional and static
				<MessageBlock key={i} message={message} />
			))}
		</div>
	);
}
