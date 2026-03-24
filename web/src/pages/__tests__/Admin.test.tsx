import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Admin } from "../Admin";

vi.mock("../../auth", () => ({
  useAuth: () => ({
    userId: "u1",
    role: "admin",
  }),
  getOrMintToken: vi.fn().mockResolvedValue("dev-token"),
}));

describe("Admin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows generated link and copy action when created without target email", async () => {
    const link = "https://localhost:5173/oneshot#token=t12345";
    const mockFetch = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ token_id: "t12345", link }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<Admin />);

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/oneshot-tokens",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ target_email: null }),
        }),
      );
    });

    expect(await screen.findByDisplayValue(link)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy Link" }));
    expect(writeText).toHaveBeenCalledWith(link);
  });

  it("renders audit tables with mocked API data", async () => {
    const mockFetch = vi.spyOn(window, "fetch");
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "t1234567890",
              target_email: "alice@example.com",
              is_used: true,
              created_at: "2026-03-24T00:00:00Z",
              expires_at: "2026-03-25T00:00:00Z",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "f1234567890",
              original_filename: "report.pdf",
              mime_type: "application/pdf",
              size_bytes: 4096,
              created_at: "2026-03-24T00:00:00Z",
              target_email: "alice@example.com",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    render(<Admin />);

    fireEvent.click(screen.getByRole("button", { name: "Audit Logs" }));

    expect(await screen.findByText("Token History")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("alice@example.com")).toHaveLength(2);
    });
    expect(screen.getByText("Used")).toBeInTheDocument();
    expect(screen.getByText(/Expires:/)).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });
});
