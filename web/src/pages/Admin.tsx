import { FormEvent, useCallback, useEffect, useState } from "react";
import { getOrMintToken, useAuth } from "../auth";
import type {
  FileAuditItem,
  OneShotTokenAuditItem,
} from "../api/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/Card";
import { Shield, Users } from "lucide-react";
import { Alert } from "../components/Alert";
import { Input } from "../components/Input";
import { Button } from "../components/Button";

function formatBytes(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (sizeBytes >= 1024) {
    return `${(sizeBytes / 1024).toFixed(2)} KB`;
  }
  return `${sizeBytes} B`;
}

function parseDispositionFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }
  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() ?? null;
}

export function Admin() {
  const { userId, role } = useAuth();
  const [targetEmail, setTargetEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<"issue" | "audit">("issue");
  const [tokens, setTokens] = useState<OneShotTokenAuditItem[]>([]);
  const [files, setFiles] = useState<FileAuditItem[]>([]);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchAuditData = useCallback(async () => {
    setIsAuditLoading(true);
    setErrorMessage(null);
    try {
      const token = await getOrMintToken("http");
      const headers = { Authorization: `Bearer ${token}` };
      const [tokensResponse, filesResponse] = await Promise.all([
        fetch("/api/admin/oneshot-tokens", { headers }),
        fetch("/api/admin/files", { headers }),
      ]);
      if (!tokensResponse.ok) {
        throw new Error(
          `Failed to load token history (status: ${tokensResponse.status})`,
        );
      }
      if (!filesResponse.ok) {
        throw new Error(`Failed to load files (status: ${filesResponse.status})`);
      }
      const tokenData = (await tokensResponse.json()) as OneShotTokenAuditItem[];
      const fileData = (await filesResponse.json()) as FileAuditItem[];
      setTokens(tokenData);
      setFiles(fileData);
    } catch (e) {
      setErrorMessage(
        e instanceof Error ? e.message : "Failed to load audit logs.",
      );
    } finally {
      setIsAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAuditData();
  }, [fetchAuditData]);

  const onGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setGeneratedLink(null);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/oneshot-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_email: targetEmail || null }),
      });
      const data = (await response.json()) as {
        sent?: boolean;
        link?: string;
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(
          data.detail ??
            `Failed to generate OneShot link (status: ${response.status})`,
        );
      }
      if (data.sent) {
        setSuccessMessage("Link successfully dispatched to user email.");
        return;
      }
      if (data.link) {
        setGeneratedLink(data.link);
      }
      await fetchAuditData();
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : "Failed to generate OneShot link. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Admin Panel</h1>
        <p className="text-text-muted">
          Server-side RBAC enforces all admin operations
        </p>
      </div>

      <Alert variant="info">
        This page is role-gated in the frontend. However, all admin operations
        are enforced server-side. The server derives roles from the database,
        never from JWT claims.
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text">Admin Info</h2>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-text-muted" />
            <span className="text-text-muted">User ID:</span>
            <span className="font-mono text-text">{userId}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-text-muted" />
            <span className="text-text-muted">Role:</span>
            <span className="font-medium text-text capitalize">{role}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Generate OneShot Link</CardTitle>
          <CardDescription>
            Optionally provide a recipient email to dispatch a secure single-use
            upload link.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {successMessage && <Alert variant="success">{successMessage}</Alert>}
          {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
          <form onSubmit={onGenerate} className="space-y-4">
            <Input
              id="target-email"
              label="Target Email (optional)"
              type="email"
              placeholder="user@example.com"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              disabled={isLoading}
            />
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Generating..." : "Generate"}
            </Button>
          </form>

          {generatedLink && (
            <div className="space-y-3">
              <Input
                id="generated-link"
                label="Generated Link"
                type="text"
                value={generatedLink}
                readOnly
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(generatedLink)}
              >
                Copy Link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={activeSection === "issue" ? "primary" : "secondary"}
          onClick={() => setActiveSection("issue")}
        >
          Issue Token
        </Button>
        <Button
          type="button"
          variant={activeSection === "audit" ? "primary" : "secondary"}
          onClick={() => setActiveSection("audit")}
        >
          Audit Logs
        </Button>
      </div>

      {activeSection === "audit" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Audit Logs</CardTitle>
            <CardDescription>
              Recent token issuance and uploaded file history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isAuditLoading && <Alert variant="info">Loading audit logs…</Alert>}
            <div className="space-y-3">
              <h3 className="text-base font-semibold">Token History</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-muted border-b border-border">
                      <th className="py-2 pr-4">Token</th>
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Used</th>
                      <th className="py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((tokenRow) => (
                      <tr key={tokenRow.id} className="border-b border-border/60">
                        <td className="py-2 pr-4 font-mono">{tokenRow.id.slice(0, 8)}…</td>
                        <td className="py-2 pr-4">{tokenRow.target_email ?? "—"}</td>
                        <td className="py-2 pr-4">{tokenRow.is_used ? "Yes" : "No"}</td>
                        <td className="py-2">
                          {new Date(tokenRow.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {tokens.length === 0 && (
                      <tr>
                        <td className="py-2 text-text-muted" colSpan={4}>
                          No tokens issued yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-base font-semibold">Uploaded Files</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-text-muted border-b border-border">
                      <th className="py-2 pr-4">Filename</th>
                      <th className="py-2 pr-4">Size</th>
                      <th className="py-2 pr-4">When</th>
                      <th className="py-2 pr-4">Token Email</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((fileRow) => (
                      <tr key={fileRow.id} className="border-b border-border/60">
                        <td className="py-2 pr-4">{fileRow.original_filename}</td>
                        <td className="py-2 pr-4">{formatBytes(fileRow.size_bytes)}</td>
                        <td className="py-2 pr-4">
                          {new Date(fileRow.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4">{fileRow.target_email ?? "—"}</td>
                        <td className="py-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              try {
                                const token = await getOrMintToken("http");
                                const response = await fetch(
                                  `/api/admin/files/${fileRow.id}/download`,
                                  {
                                    headers: { Authorization: `Bearer ${token}` },
                                  },
                                );
                                if (!response.ok) {
                                  throw new Error(
                                    `Download failed (status: ${response.status})`,
                                  );
                                }
                                const blob = await response.blob();
                                const filename =
                                  parseDispositionFilename(
                                    response.headers.get("content-disposition"),
                                  ) ?? fileRow.original_filename;
                                const objectUrl = window.URL.createObjectURL(blob);
                                const anchor = document.createElement("a");
                                anchor.href = objectUrl;
                                anchor.download = filename;
                                document.body.appendChild(anchor);
                                anchor.click();
                                anchor.remove();
                                window.URL.revokeObjectURL(objectUrl);
                              } catch (e) {
                                setErrorMessage(
                                  e instanceof Error
                                    ? e.message
                                    : "Failed to download file.",
                                );
                              }
                            }}
                          >
                            Download
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {files.length === 0 && (
                      <tr>
                        <td className="py-2 text-text-muted" colSpan={5}>
                          No uploads yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
