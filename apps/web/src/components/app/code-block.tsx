"use client";

import { IconCircleCheckFilled, IconCopyFilled } from "@tabler/icons-react";
import { Button } from "@foglamp/ui/components/button";
import { cn } from "@foglamp/ui/lib/utils";
import { useEffect, useState } from "react";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// A copy-pasteable code block with Shiki syntax highlighting. Highlighting runs
// client-side and async; the raw code renders immediately as a fallback so there
// is never an empty flash. The highlighter is a lazy singleton (built once,
// shared by every CodeBlock) and uses the pure-JS regex engine — no wasm to
// load in the browser. Dual theme: `github-light` in light mode, `vesper` in
// dark; each token carries both as CSS variables, selected by the `.dark` class
// (see index.css).

let highlighterPromise: Promise<HighlighterCore> | undefined;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [
        import("shiki/themes/github-light.mjs"),
        import("shiki/themes/vesper.mjs"),
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
  actions,
}: {
  code: string;
  lang?: string;
  /** Extra controls rendered in the top-right corner, left of the copy button. */
  actions?: React.ReactNode;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void getHighlighter()
      .then((hl) => {
        const out = hl.codeToHtml(code, {
          lang,
          themes: { light: "github-light", dark: "vesper" },
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
    <div
      className={cn(
        "relative text-left text-xs [&_pre]:m-0 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted/50! [&_pre]:dark:bg-muted/20!  [&_pre]:p-5 [&_pre]:leading-relaxed [&_pre]:shadow-(--custom-shadow) corner-squircle",
        actions ? "[&_pre]:pt-5" : "[&_pre]:pr-10"
      )}
    >
      {html ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="bg-muted! dark:bg-muted! text-foreground">
          <code>{code}</code>
        </pre>
      )}
      <div className="absolute right-3 top-3 flex items-center gap-1">
        {actions}
        <Button
          size="icon-sm"
          variant="outline"
          className="text-muted-foreground hover:text-foreground shadow-none dark:bg-input/20"
          aria-label="Copy code"
          onClick={copy}
        >
          {copied ? <IconCircleCheckFilled /> : <IconCopyFilled />}
        </Button>
      </div>
    </div>
  );
}
