import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Admin } from "../Admin";

vi.mock("../../auth", () => ({
  useAuth: () => ({
    userId: "u1",
    role: "admin",
  }),
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
});
