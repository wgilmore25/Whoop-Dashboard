"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockConnections } from "@/lib/mock-data";
import type { OAuthConnection, ConnectionStatus, OAuthProvider } from "@/lib/types";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; variant: "success" | "danger" | "warning" | "secondary"; icon: React.ElementType }
> = {
  connected:     { label: "Connected",     variant: "success",   icon: CheckCircle2 },
  disconnected:  { label: "Disconnected",  variant: "secondary", icon: XCircle },
  token_expired: { label: "Token Expired", variant: "warning",   icon: AlertCircle },
  sync_error:    { label: "Sync Error",    variant: "danger",    icon: AlertCircle },
};

const DISCONNECTED_CONN = (provider: OAuthProvider): OAuthConnection => ({
  id: "",
  user_id: "",
  provider,
  provider_user_id: "",
  status: "disconnected",
  last_synced_at: null,
});

function ConnectionCard({
  provider,
  connection,
  onSync,
  syncing,
}: {
  provider: "WHOOP" | "Strava";
  connection: OAuthConnection;
  onSync: () => void;
  syncing: boolean;
}) {
  const cfg = STATUS_CONFIG[connection.status] ?? STATUS_CONFIG.disconnected;
  const Icon = cfg.icon;
  const isMock = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

  function handleConnect() {
    if (isMock) {
      alert(
        `Mock mode: Would redirect to ${provider} OAuth flow.\nSet NEXT_PUBLIC_MOCK_MODE=false and add real credentials to connect.`
      );
      return;
    }
    const route = provider === "WHOOP" ? "/api/whoop/connect" : "/api/strava/connect";
    window.location.href = route;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3">
            <span className="text-lg">{provider === "WHOOP" ? "⚡" : "🚴"}</span>
            {provider}
          </CardTitle>
          <Badge variant={cfg.variant}>
            <Icon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {connection.last_synced_at && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Last synced:{" "}
            {new Date(connection.last_synced_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
        )}

        <div className="flex gap-2">
          {connection.status === "disconnected" ? (
            <Button onClick={handleConnect} size="sm">
              Connect {provider}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onSync}
                loading={syncing}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`}
                />
                Sync Now
              </Button>
              <Button variant="ghost" size="sm" onClick={handleConnect}>
                Reconnect
              </Button>
            </>
          )}
        </div>

        {isMock && (
          <p className="text-xs text-muted-foreground italic">
            Mock mode — showing demo connection status.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConnectPage() {
  const isMock = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

  // Connection state — starts from mock data in mock mode, fetched from API otherwise
  const [connections, setConnections] = useState<{
    whoop: OAuthConnection;
    strava: OAuthConnection;
  }>(
    isMock
      ? mockConnections
      : { whoop: DISCONNECTED_CONN("whoop"), strava: DISCONNECTED_CONN("strava") }
  );
  const [connectionsLoading, setConnectionsLoading] = useState(!isMock);

  const [whoopSyncing, setWhoopSyncing] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Read success/error params set by OAuth callbacks
  const [pageMessage, setPageMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Load real connection statuses and surface OAuth callback messages
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");

    if (success) {
      setPageMessage({
        type: "success",
        text:
          success === "whoop"
            ? "WHOOP connected successfully."
            : "Strava connected successfully.",
      });
      // Clean up URL without reload
      window.history.replaceState({}, "", "/connect");
    } else if (error) {
      setPageMessage({
        type: "error",
        text:
          error === "whoop_auth_failed"
            ? "WHOOP connection failed — please try again."
            : error === "whoop_token_failed"
            ? "WHOOP authorization could not be renewed — start Reconnect again."
            : error === "whoop_code_expired"
            ? "The WHOOP authorization page expired before it completed. Click Reconnect and finish the new window without using Back or Refresh."
            : error === "whoop_invalid_client"
            ? "WHOOP rejected the app credentials. Confirm the Client ID and Client Secret in .env.local match the same WHOOP developer app."
            : error === "whoop_no_refresh_token"
            ? "WHOOP connected without a renewable token. Remove this app from WHOOP Authorized Apps, then reconnect and grant access again."
            : error === "strava_auth_failed"
            ? "Strava connection failed — please try again."
            : "Connection failed — please try again.",
      });
      window.history.replaceState({}, "", "/connect");
    }

    if (isMock) return;

    // Fetch live connection statuses
    async function loadConnections() {
      try {
        const res = await fetch("/api/connections");
        if (res.ok) {
          const data = await res.json();
          setConnections({
            whoop: data.whoop ?? DISCONNECTED_CONN("whoop"),
            strava: data.strava ?? DISCONNECTED_CONN("strava"),
          });
        }
      } finally {
        setConnectionsLoading(false);
      }
    }

    loadConnections();
  }, [isMock]);

  async function handleSync(provider: "whoop" | "strava") {
    const setLoading = provider === "whoop" ? setWhoopSyncing : setStravaSyncing;
    setLoading(true);
    setSyncResult(null);

    if (isMock) {
      await new Promise((r) => setTimeout(r, 1200));
      setSyncResult(`Mock sync complete for ${provider.toUpperCase()}.`);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      setSyncResult(data.message ?? "Sync complete.");

      // Refresh connection statuses to reflect new last_synced_at
      const connRes = await fetch("/api/connections");
      if (connRes.ok) {
        const connData = await connRes.json();
        setConnections({
          whoop: connData.whoop ?? DISCONNECTED_CONN("whoop"),
          strava: connData.strava ?? DISCONNECTED_CONN("strava"),
        });
      }
    } catch {
      setSyncResult("Sync failed — check console for details.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold">Connect Data Sources</h1>
          <p className="text-muted-foreground mt-1">
            Link WHOOP and Strava to power your readiness dashboard.
          </p>
        </div>

        {pageMessage && (
          <div
            className={`p-3 border rounded-lg text-sm ${
              pageMessage.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-rose-50 border-rose-200 text-rose-700"
            }`}
          >
            {pageMessage.text}
          </div>
        )}

        {syncResult && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
            {syncResult}
          </div>
        )}

        {connectionsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {["WHOOP", "Strava"].map((p) => (
              <Card key={p}>
                <CardHeader className="pb-3">
                  <div className="h-5 w-24 bg-secondary animate-pulse rounded" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-28 bg-secondary animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ConnectionCard
              provider="WHOOP"
              connection={connections.whoop}
              onSync={() => handleSync("whoop")}
              syncing={whoopSyncing}
            />
            <ConnectionCard
              provider="Strava"
              connection={connections.strava}
              onSync={() => handleSync("strava")}
              syncing={stravaSyncing}
            />
          </div>
        )}

        <div className="rounded-xl border bg-secondary/30 p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Setup requirements</p>
          <p>• WHOOP: Register at developer.whoop.com and set your redirect URI to <code className="bg-secondary px-1 rounded">{process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/whoop/callback</code></p>
          <p>• Strava: Register at strava.com/settings/api — set Authorization Callback Domain to your app domain</p>
          <p>• Add credentials to <code className="bg-secondary px-1 rounded">.env.local</code> and set <code className="bg-secondary px-1 rounded">NEXT_PUBLIC_MOCK_MODE=false</code></p>
        </div>
      </div>
    </AppShell>
  );
}
