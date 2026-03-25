import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/Card";
import { Input } from "../components/Input";
import { Alert } from "../components/Alert";

type UploadState =
  | "IDLE"
  | "VALIDATING"
  | "UPLOADING"
  | "SUCCESS"
  | "ERROR_INVALID_TOKEN"
  | "ERROR_UPLOAD_FAILED";

function tokenFromHash(): string | null {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const token = params.get("token");
  return token && token.length > 0 ? token : null;
}

export function OneShotUpload() {
  const token = useMemo(() => tokenFromHash(), []);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>(
    token ? "VALIDATING" : "ERROR_INVALID_TOKEN",
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    let isMounted = true;
    const validateToken = async () => {
      try {
        const res = await fetch("/api/oneshot/token-status", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          if (isMounted) setUploadState("ERROR_INVALID_TOKEN");
          return;
        }
        const data = (await res.json()) as { valid?: boolean };
        if (!isMounted) return;
        setUploadState(data.valid ? "IDLE" : "ERROR_INVALID_TOKEN");
      } catch {
        if (isMounted) setUploadState("ERROR_INVALID_TOKEN");
      }
    };
    void validateToken();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setUploadState("ERROR_INVALID_TOKEN");
      return;
    }
    if (!file) return;
    setUploadState("UPLOADING");

    const body = new FormData();
    body.append("file", file);

    try {
      const res = await fetch("/api/oneshot/upload", {
        method: "POST",
        body,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.status === 401) {
        setUploadState("ERROR_INVALID_TOKEN");
        return;
      }
      if (!res.ok) {
        setUploadState("ERROR_UPLOAD_FAILED");
        return;
      }
      setUploadState("SUCCESS");
    } catch {
      setUploadState("ERROR_UPLOAD_FAILED");
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>OneShot File Upload</CardTitle>
          <CardDescription>Upload exactly one file with your one-time secure link.</CardDescription>
        </CardHeader>
        <CardContent>
          {uploadState === "ERROR_INVALID_TOKEN" && (
            <Alert variant="error">
              Link Expired or Invalid. This one-shot link is invalid or already
              used.
            </Alert>
          )}
          {uploadState === "ERROR_UPLOAD_FAILED" && (
            <Alert variant="error">Upload failed. Please try again with a new link.</Alert>
          )}
          {uploadState === "SUCCESS" && (
            <Alert variant="success">Upload complete. This link can no longer be used.</Alert>
          )}

          <form className="space-y-4 mt-4" onSubmit={onSubmit}>
            <Input
              id="oneshot-file"
              type="file"
              label="Upload File"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={
                uploadState === "VALIDATING" ||
                uploadState === "UPLOADING" ||
                uploadState === "SUCCESS" ||
                uploadState === "ERROR_INVALID_TOKEN"
              }
            />
            <Button
              type="submit"
              disabled={
                !file ||
                uploadState === "VALIDATING" ||
                uploadState === "UPLOADING" ||
                uploadState === "SUCCESS" ||
                uploadState === "ERROR_INVALID_TOKEN"
              }
            >
              {uploadState === "VALIDATING"
                ? "Validating link..."
                : uploadState === "UPLOADING"
                  ? "Uploading..."
                  : "Upload"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
