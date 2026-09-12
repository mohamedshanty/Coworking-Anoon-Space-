import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { deactivateMemberOnAnoonQr } from "./anoon-sync";

const BASE_URL = "https://anoon-qr.example.com";
const SECRET = "test-internal-secret";

beforeEach(() => {
  vi.resetAllMocks();
  process.env.ANOON_QR_BASE_URL = BASE_URL;
  process.env.INTERNAL_SYNC_SECRET = SECRET;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ANOON_QR_BASE_URL;
  delete process.env.INTERNAL_SYNC_SECRET;
});

function mockFetchOk() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(""),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("deactivateMemberOnAnoonQr", () => {
  it("POSTs to /sync/member/deactivate with phone + secret header", async () => {
    const fetchMock = mockFetchOk();
    const outcome = await deactivateMemberOnAnoonQr("0590000000");

    expect(outcome).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/sync/member/deactivate`);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "X-Internal-Secret": SECRET });
    expect(JSON.parse(init.body)).toEqual({ phone: "0590000000" });
  });

  it("returns http-<status> on non-OK without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("not found"),
      }),
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(deactivateMemberOnAnoonQr("0590000000")).resolves.toEqual({
        ok: false,
        reason: "http-404",
      });
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("returns not-configured when env is missing", async () => {
    delete process.env.ANOON_QR_BASE_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(deactivateMemberOnAnoonQr("0590000000")).resolves.toEqual({
      ok: false,
      reason: "not-configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns network-error when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection refused")),
    );
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(deactivateMemberOnAnoonQr("0590000000")).resolves.toEqual({
        ok: false,
        reason: "network-error",
      });
    } finally {
      errSpy.mockRestore();
    }
  });
});
