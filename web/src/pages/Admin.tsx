import { FormEvent, useState } from "react";
import { useAuth } from "../auth";
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

export function Admin() {
  const { userId, role } = useAuth();
  const [targetEmail, setTargetEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
            `Failed to generate one-shot link (status: ${response.status})`,
        );
      }
      if (data.sent) {
        setSuccessMessage("Link successfully dispatched to user email.");
        return;
      }
      if (data.link) {
        setGeneratedLink(data.link);
      }
    } catch (e) {
      setErrorMessage(
        e instanceof Error
          ? e.message
          : "Failed to generate one-shot link. Please try again.",
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
    </div>
  );
}
