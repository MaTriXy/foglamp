import { useState } from "react";
import { FoglampHUD, ModelLogo, formatModelName } from "foglamp/hud";
import {
  IconBoltFilled,
  IconChartBar,
  IconCode,
  IconDownload,
  IconList,
  IconMail,
  IconMessage,
  IconMoon,
  IconPlayerPlayFilled,
  IconSearch,
  IconSun,
} from "@tabler/icons-react";

import { Badge } from "@foglamp/ui/components/badge";
import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { Separator } from "@foglamp/ui/components/separator";

import { AGENTS } from "./agents";

function trigger(path: string) {
  void fetch(path, { method: "POST" });
}

// Tool-call glyph by name convention (mirrors the HUD's tree icons).
function toolIcon(name: string): typeof IconSearch {
  const n = name.toLowerCase();
  if (/(search|find|query|lookup)/.test(n)) return IconSearch;
  if (/(list|tables|files)/.test(n)) return IconList;
  if (/(get|fetch|read|load)/.test(n)) return IconDownload;
  if (/(send|email|mail|notify)/.test(n)) return IconMail;
  if (/(chart|plot|graph|report)/.test(n)) return IconChartBar;
  if (/(comment|reply|message|post)/.test(n)) return IconMessage;
  return IconCode;
}

export default function App() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
  };

  return (
    <div className="min-h-full bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-9 pb-0 pt-16">
          <div className="flex-1">
            <h1 className="text-base font-semibold leading-tight">Acme AI Console</h1>
            <p className="text-sm text-muted-foreground">
              A stand-in app — the Foglamp HUD streams every run live.
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {dark ? <IconSun /> : <IconMoon />}
          </Button>
          <Button onClick={() => trigger("/api/storm")}>
            <IconBoltFilled /> Run storm
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent) => (
            <Card key={agent.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="font-normal text-sm">{agent.name}</CardTitle>
                <CardDescription>{agent.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ModelLogo
                    provider={agent.provider}
                    modelId={agent.model}
                    size={16}
                    className="rounded-[3px]"
                  />
                  {formatModelName(agent.model)}
                </div>
                <Separator className="my-3" />
                <div className="flex flex-wrap gap-1.5">
                  {agent.tools.map((tool) => {
                    const ToolIcon = toolIcon(tool);
                    return (
                      <Badge
                        key={tool}
                        variant="secondary"
                        className="gap-1 font-mono text-[11px] font-normal"
                      >
                        <ToolIcon className="size-3" /> {tool}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => trigger(`/api/run?agent=${agent.id}`)}
                >
                  <IconPlayerPlayFilled /> Run
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          In your own app this is two lines:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">foglamp(&#123; hud: true &#125;)</code>{" "}
          on the server and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">&lt;FoglampHUD /&gt;</code>{" "}
          in the client.
        </p>
      </main>

      {/* Connect to the broker through this server's own origin (proxied at
          /hud/events) so it works both locally and on the hosted demo. */}
      <FoglampHUD url="/hud/events" />
    </div>
  );
}
