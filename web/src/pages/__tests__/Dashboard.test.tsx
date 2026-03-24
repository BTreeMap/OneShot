import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Dashboard } from "../Dashboard";

vi.mock("../../auth", () => ({
  useAuth: () => ({
    userId: "u-admin",
  }),
  getOrMintToken: vi.fn().mockResolvedValue("dev-token"),
}));

describe("Dashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders OneShot metrics from admin stats endpoint", async () => {
    const mockFetch = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          total_files: 3,
          total_storage_bytes: 1536,
          tokens_issued: 7,
          tokens_used: 4,
          active_tokens: 2,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<Dashboard />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/stats", {
        headers: { Authorization: "Bearer dev-token" },
      });
    });

    expect(await screen.findByText("Total Files Received")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1.50 KB")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Zero-Trust Mode")).toBeInTheDocument();
  });
});
