import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { OneShotUpload } from "../OneShotUpload";

describe("OneShotUpload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = "#token=t12345";
  });

  it("extracts token from hash and sends Authorization bearer header", async () => {
    const mockFetch = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ file_id: "f123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<OneShotUpload />);

    const input = screen.getByLabelText("File") as HTMLInputElement;
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t12345");
  });
});
