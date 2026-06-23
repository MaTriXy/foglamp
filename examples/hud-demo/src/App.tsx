import { useState } from "react";
import { FoglampHUD, ModelLogo, formatModelName } from "foglamp/hud";
import { IconBoltFilled, IconMoon, IconPlayerPlayFilled, IconSun } from "@tabler/icons-react";

import { Button } from "@foglamp/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";

import { AGENTS } from "./agents";

function trigger(path: string) {
  void fetch(path, { method: "POST" });
}

// Foglamp brand mark — three overlapping circles (lead → blue → orange). Lead is
// theme-aware: dark in light mode, light in dark mode.
function FoglampMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 48" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="24" cy="24" r="24" className="fill-[#1e1e1e] dark:fill-[#EEE]" />
      <circle cx="48" cy="24" r="24" fill="#0090FD" />
      <circle cx="72" cy="24" r="24" fill="#FF5513" />
    </svg>
  );
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-12 pb-0 pt-12">
          <div className="flex flex-1 items-center gap-2.5">
            <FoglampMark className="h-5 w-auto" />
            <span
              className="text-lg leading-none"
              style={{ fontFamily: '"Host Grotesk", system-ui, sans-serif', fontWeight: 600 }}
            >
              Foglamp HUD
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
            {dark ? <IconSun /> : <IconMoon />}
          </Button>
          <Button onClick={() => trigger("/api/storm")}>
            <IconBoltFilled /> Run storm
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-8">
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
                    size={14}
                    className="rounded-[3px]"
                  />
                  {formatModelName(agent.model)}
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
