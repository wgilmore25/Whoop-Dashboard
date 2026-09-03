"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Wifi } from "lucide-react";
import type { OAuthConnection } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface Props {
  connections: { whoop: OAuthConnection; strava: OAuthConnection };
}

function syncLabel(connection: OAuthConnection, name: string) {
  if (connection.status !== "connected") return `${name} not connected`;
  if (!connection.last_synced_at) return `${name} connected`;
  return `${name} synced`;
}

export function SyncStatus({ connections }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncAll() {
    setSyncing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json();
      setMessage(result.message ?? (response.ok ? "Sync complete" : "Sync failed"));
      if (response.ok) window.location.reload();
    } catch {
      setMessage("Sync could not be reached. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <Wifi className="h-4 w-4" />
        <span className="font-medium">{message ?? "Live data connections"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span>⚡ {syncLabel(connections.whoop, "WHOOP")}</span>
        <span>🚴 {syncLabel(connections.strava, "Strava")}</span>
        <Button size="sm" variant="outline" onClick={syncAll} disabled={syncing}>
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Sync Now
        </Button>
      </div>
    </div>
  );
}
