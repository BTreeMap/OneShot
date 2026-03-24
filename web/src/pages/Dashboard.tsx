import { useEffect, useState } from "react";
import { FileText, HardDrive, Link, ShieldCheck } from "lucide-react";
import { getOrMintToken, useAuth } from "../auth";
import type { OneShotStatsResponse } from "../api/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "../components/Card";
import { Alert } from "../components/Alert";

function formatBytes(sizeBytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  if (unitIndex === 0) {
    return `${value} ${units[unitIndex]}`;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

export function Dashboard() {
  const { userId } = useAuth();
  const [stats, setStats] = useState<OneShotStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const token = await getOrMintToken("http");
        const response = await fetch("/api/admin/stats", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(`Failed to load dashboard stats (status: ${response.status})`);
        }
        const payload = (await response.json()) as OneShotStatsResponse;
        if (isMounted) {
          setStats(payload);
        }
      } catch (e) {
        if (isMounted) {
          setErrorMessage(
            e instanceof Error ? e.message : "Failed to load dashboard stats.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    void loadStats();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1
          className="text-3xl font-bold tracking-tight"
          data-testid="dashboard-heading"
        >
          Dashboard
        </h1>
        <p className="text-text-muted mt-1">
          OneShot observability for <span className="font-semibold text-text">{userId}</span>.
        </p>
      </div>

      {isLoading && <Alert variant="info">Loading OneShot operational metrics…</Alert>}
      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

      {stats && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Files Received</CardTitle>
                <FileText className="h-4 w-4 text-text-muted" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_files}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
                <HardDrive className="h-4 w-4 text-text-muted" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatBytes(stats.total_storage_bytes)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Upload Links</CardTitle>
                <Link className="h-4 w-4 text-text-muted" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.active_tokens}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tokens Issued</CardTitle>
                <ShieldCheck className="h-4 w-4 text-text-muted" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.tokens_issued}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Zero-Trust Mode</CardTitle>
              <CardDescription>
                OneShot enforces strict upload security invariants by design.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-text-muted">
              <p>
                No standard external accounts are provisioned. Access is granted through
                ephemeral single-use upload links only.
              </p>
              <p>
                Uploaded files are neutralized at rest as opaque extensionless blobs, with
                original metadata preserved only in controlled metadata records.
              </p>
              <p>
                Token redemption is atomic and irreversible, preventing replay and ensuring
                links expire exactly once.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
