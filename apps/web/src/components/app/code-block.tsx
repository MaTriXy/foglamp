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
// load in the browser. Dual github-light/github-dark themes emit CSS variables;
// `.dark` selects between them (see globals.css).

let highlighterPromise: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [
        import("shiki/themes/github-light.mjs"),
        import("shiki/themes/github-dark.mjs"),
      ],
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
        const out = hl.codeToHtml(code, {
          lang,
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
        });
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
    <div className="relative text-left text-xs [&_pre]:m-0 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:!bg-muted [&_pre]:p-3 [&_pre]:pr-10 [&_pre]:leading-relaxed">
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre>
          <code>{code}</code>
        </pre>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        className="absolute right-1.5 top-1.5"
        aria-label="Copy code"
        onClick={copy}
      >
        {copied ? <IconCircleCheckFilled /> : <IconCopyFilled />}
      </Button>
    </div>
  );
}
