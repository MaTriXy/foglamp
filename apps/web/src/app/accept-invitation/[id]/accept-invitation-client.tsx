"use client";

import { Button } from "@foglamp/ui/components/button";
import { IconCodeAsterix } from "@tabler/icons-react";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

type State = "accepting" | "done" | "error";

export function AcceptInvitationClient({
  invitationId,
}: {
  invitationId: string;
}) {
  const [state, setState] = useState<State>("accepting");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (cancelled) return;
      if (res.error) {
        setMessage(res.error.message ?? "This invitation is no longer valid.");
        setState("error");
      } else {
        setState("done");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <div className="size-10 rounded-lg bg-muted flex justify-center items-center">
        <IconCodeAsterix className="size-6 stroke-1" />
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <h1 className="text-xl font-medium text-balance">Invitation</h1>
        {state === "accepting" && (
          <p className="text-sm text-muted-foreground">
            Accepting your invitation…
          </p>
        )}
        {state === "done" && (
          <p className="text-sm text-muted-foreground">
            You&apos;ve joined the organization.
          </p>
        )}
        {state === "error" && (
          <p className="text-sm text-destructive">{message}</p>
        )}
      </div>
      {state === "done" && (
        <Button
          size="sm"
          className="self-start"
          // Hard navigation so the app shell refetches the project list with
          // the new membership.
          onClick={() => {
            window.location.href = "/overview";
          }}
        >
          Go to dashboard
        </Button>
      )}
      {state === "error" && (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => {
            window.location.href = "/overview";
          }}
        >
          Go to dashboard
        </Button>
      )}
    </div>
  );
}
