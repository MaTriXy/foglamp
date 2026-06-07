"use client";

import { Badge } from "@foglamp/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@foglamp/ui/components/card";
import { cn } from "@foglamp/ui/lib/utils";
import { IconAlertTriangleFilled, IconCircleCheckFilled } from "@tabler/icons-react";

import { PageHeader } from "@/components/app/page-parts";

import { ALERTS } from "../mock-data";

export function AlertsTab() {
  return (
    <>
      <PageHeader
        title="Alerts"
        description="Threshold rules on cost, latency, errors, and eval scores — checked every minute."
      />
      <section className="grid gap-4 md:grid-cols-2">
        {ALERTS.map((a) => {
          const firing = a.status === "firing";
          return (
            <Card
              key={a.id}
              className={cn(
                firing &&
                  "shadow-[inset_0_0_0_1px_rgba(244,63,94,0.3),0_2px_10px_-4px_rgba(244,63,94,0.4)]",
              )}
            >
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-xl corner-squircle p-0.5",
                      firing
                        ? "bg-rose-100 text-rose-500 dark:bg-rose-950"
                        : "bg-emerald-100 text-emerald-500 dark:bg-emerald-950",
                    )}
                  >
                    {firing ? (
                      <span className="relative grid place-items-center">
                        <span className="absolute size-4 animate-ping rounded-full bg-rose-500/40" />
                        <IconAlertTriangleFilled className="relative size-4" />
                      </span>
                    ) : (
                      <IconCircleCheckFilled className="size-4" />
                    )}
                  </span>
                  <CardTitle className="truncate">{a.name}</CardTitle>
                  <Badge variant={firing ? "rose" : "emerald"} className="ml-auto">
                    {firing ? "Firing" : "OK"}
                  </Badge>
                </div>
                <CardDescription className="font-mono text-xs">
                  {a.metric} {a.condition}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-baseline justify-between">
                <span className="text-2xl font-medium tabular-nums">{a.lastValue}</span>
                <span className="text-xs text-muted-foreground">{a.when}</span>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </>
  );
}
