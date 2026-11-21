"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Wifi } from "lucide-react";
import type { OAuthConnection } from "@/lib/types";
import { syncFreshness, type SyncFreshness } from "@/lib/sync/freshness";
import { Button } from "@/components/ui/button";

interface Props {
  connections: { whoop: OAuthConnection; strava: OAuthConnection };
  now: string;
}

const statusLabels: Record<SyncFreshness, string> = {
  fresh: "Current",
  stale: "Stale",
  missing: "Awaiting first sync",
  disconnected: "Disconnected",
  token_expired: "Reconnect needed",
  sync_error: "Last sync failed",
};

const syncTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
});

function ProviderStatus({ connection, name, now }: { connection: OAuthConnection; name: string; now: Date }) {
  const timestamp = connection.last_synced_at;
  const lastSuccess = timestamp ? new Date(timestamp) : null;
  return (
    <span>
      {name} · {statusLabels[syncFreshness(connection, now)]}
      {timestamp && lastSuccess && Number.isFinite(lastSuccess.getTime()) && (
        <> · Last sync <time dateTime={timestamp}>{syncTimeFormat.format(lastSuccess)}</time></>
      )}
    </span>
  );
}

export function SyncStatus({ connections, now }: Props) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncAll() {
    setSyncing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json();
      setMessage(result.message ?? (response.ok ? "Sync complete" : "Sync failed"));
      if (response.ok) router.refresh();
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
        <span role="status" className="font-medium">{message ?? "Live data connections"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <ProviderStatus connection={connections.whoop} name="WHOOP" now={new Date(now)} />
        <ProviderStatus connection={connections.strava} name="Strava" now={new Date(now)} />
        <Button size="sm" variant="outline" onClick={syncAll} disabled={syncing}>
          {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Sync Now
        </Button>
      </div>
    </div>
  );
}
