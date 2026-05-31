"use client";

import { IconCircleCheckFilled, IconCopyFilled } from "@tabler/icons-react";
import { Button } from "@foglamp/ui/components/button";
import { useEffect, useState } from "react";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// A copy-pasteable code block with Shiki syntax highlighting. Highlighting runs
// client-side and async; the raw code renders immediately as a fallback so there
// is never an empty flash. The highlighter is a lazy singleton (built once,
// shared by every CodeBlock) and uses the pure-JS regex engine — no wasm to
// load in the browser. Uses the `vesper` theme (dark-only), so code blocks are
// always dark regardless of the app's light/dark mode.

const THEME = "vesper";
// Vesper's background — used for the pre-highlight fallback so there is no
// light→dark flash before Shiki resolves.
const THEME_BG = "#101010";

let highlighterPromise: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [import("shiki/themes/vesper.mjs")],
      langs: [import("shiki/langs/typescript.mjs")],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

export function CodeBlock({
  code,
  lang = "typescript",
}: {
  code: string;
  lang?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void getHighlighter()
      .then((hl) => {
        const out = hl.codeToHtml(code, { lang, theme: THEME });
        if (active) setHtml(out);
      })
      .catch(() => {
        /* keep the plain-text fallback */
      });
    return () => {
      active = false;
    };
  }, [code, lang]);

  const copy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative text-left text-xs [&_pre]:m-0 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:pr-10 [&_pre]:leading-relaxed">
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre style={{ backgroundColor: THEME_BG, color: "#a0a0a0" }}>
          <code>{code}</code>
        </pre>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        className="absolute right-1.5 top-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
        aria-label="Copy code"
        onClick={copy}
      >
        {copied ? <IconCircleCheckFilled /> : <IconCopyFilled />}
      </Button>
    </div>
  );
}
