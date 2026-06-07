"use client";

import {
  IconBoltFilled,
  IconBookFilled,
  IconClipboardCheckFilled,
  IconExternalLink,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { useEffect, useRef, useState } from "react";

import { CopyIcon } from "@/components/app/copy-icon";
import { useProject } from "@/components/app/project-context";
import { trpc } from "@/utils/trpc";

const DOCS_URL = "https://docs.foglamp.dev/quickstart";
const KEY_NAME = "Onboarding";

// A soft rainbow gradient ring: a 1px gradient-filled wrapper that the opaque
// card sits inside, so only the thin border shows the rainbow. The conic
// gradient rotates slowly via the registered --rainbow-angle property.
const RAINBOW_RING =
  "rounded-3xl corner-squircle p-px animate-rainbow-spin bg-[conic-gradient(from_var(--rainbow-angle),rgba(244,114,182,0.55),rgba(167,139,250,0.55),rgba(96,165,250,0.55),rgba(110,231,183,0.55),rgba(253,224,71,0.55),rgba(252,165,165,0.55),rgba(244,114,182,0.55))]";

// The prompt a user pastes into their coding agent. The key is inlined so it's
// truly paste-and-go; the agent fetches the docs and wires the SDK against the
// user's own codebase (mapping agents → agentName, flows → workflowName/runId).
function buildPrompt(apiKey: string): string {
  return `Instrument this app with Foglamp tracing (observability for AI agents).

1. Install the SDK:  npm i foglamp
2. Add to .env:      FOGLAMP_API_KEY=${apiKey}
3. Read ${DOCS_URL} and wire the Vercel AI SDK integration:
   wrap my generateText / streamText calls with fog.integration(...), and based
   on my codebase map each agent to \`agentName\` and any multi-step pipeline to
   a shared \`workflowName\` + \`workflowRunId\` (one-off calls get a \`traceName\`).
4. Run the app once so a trace is produced.

The SDK is a no-op until FOGLAMP_API_KEY is set, so this is safe to add anywhere.`;
}

export function OnboardingPanel() {
  const { projectId } = useProject();
  const qc = useQueryClient();
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mintedRef = useRef(false);

  const keys = useQuery({
    ...trpc.projects.keys.list.queryOptions({ projectId: projectId! }),
    enabled: !!projectId,
  });

  const createKey = useMutation(
    trpc.projects.keys.create.mutationOptions({
      onSuccess: () =>
        void qc.invalidateQueries({
          queryKey: trpc.projects.keys.list.queryKey(),
        }),
    })
  );
  const deleteKey = useMutation(trpc.projects.keys.delete.mutationOptions({}));

  // Once keys have loaded, ensure we hold a usable key to inline — no click.
  // Plaintext can't be recovered, so drop any prior onboarding key and mint a
  // fresh one (covers both first visit and reloads). Runs once per mount.
  // We hard-delete rather than revoke: these are throwaway bootstrap keys, so
  // soft-revoking would pile up dead rows on every reload before the first trace.
  useEffect(() => {
    if (!projectId || keys.isLoading || mintedRef.current) return;
    mintedRef.current = true;
    const stale = (keys.data ?? []).filter((k) => k.name === KEY_NAME);
    void (async () => {
      for (const k of stale) {
        await deleteKey.mutateAsync({ projectId, keyId: k.id });
      }
      const res = await createKey.mutateAsync({ projectId, name: KEY_NAME });
      setRevealedKey(res.key);
    })();
  }, [projectId, keys.isLoading, keys.data, createKey, deleteKey]);

  const prompt = revealedKey ? buildPrompt(revealedKey) : null;
  const copy = () => {
    if (!prompt) return;
    void navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className={RAINBOW_RING}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-[6px]">
              <IconClipboardCheckFilled className="size-4" />
              Prompt
            </CardTitle>
            <CardDescription>
              Paste this into your coding agent to install and wire up the SDK.
            </CardDescription>
            <CardAction className="self-center">
              {prompt ? (
                <Button
                  size="sm"
                  variant="default"
                  onClick={copy}
                  aria-label="Copy prompt"
                >
                  <CopyIcon
                    copied={copied}
                    checkClassName="text-green-400 dark:text-green-600"
                  />
                  Copy the prompt
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Preparing your key…
                </p>
              )}
            </CardAction>
          </CardHeader>
        </Card>
      </div>

      <div className={RAINBOW_RING}>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-[6px]">
              <IconBookFilled className="size-4" />
              Old School
            </CardTitle>
            <CardDescription>
              Prefer to wire it up by hand? Follow the full instrumentation
              guide.
            </CardDescription>
            <CardAction className="self-center">
              <Button
                size="sm"
                variant="secondary"
                render={<a href={DOCS_URL} target="_blank" rel="noreferrer" />}
              >
                <IconExternalLink />
                View the docs
              </Button>
            </CardAction>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
