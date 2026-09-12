import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockVisitorFindFirst, mockEmployeeFindUnique } = vi.hoisted(() => ({
  mockVisitorFindFirst: vi.fn(),
  mockEmployeeFindUnique: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    visitor: { findFirst: mockVisitorFindFirst },
    employeeRoster: { findUnique: mockEmployeeFindUnique },
  },
}));

import { assertPhoneNotTaken } from "./personUniqueness";
import { ApiError } from "./ApiError";

const PHONE = "0590000000";

beforeEach(() => {
  vi.resetAllMocks();
  mockVisitorFindFirst.mockResolvedValue(null);
  mockEmployeeFindUnique.mockResolvedValue(null);
});

async function expect409(promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).statusCode).toBe(409);
    expect((err as ApiError).message).toBe(message);
    return;
  }
  throw new Error(`Expected 409 "${message}" but the call succeeded`);
}

describe("assertPhoneNotTaken", () => {
  it("free phone → resolves to the normalized phone", async () => {
    await expect(assertPhoneNotTaken(" 059-000-0000 ")).resolves.toBe(PHONE);
  });

  it("invalid phone → 400", async () => {
    await expect(assertPhoneNotTaken("not-a-phone")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("subscriber exists → full check 409s as subscriber (covers trainee/employee-create paths)", async () => {
    // First visitor.findFirst call is the trainee check (no match),
    // second is the subscriber check (match).
    mockVisitorFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "v-sub" });

    await expect409(
      assertPhoneNotTaken(PHONE),
      "This phone number is already registered as a subscriber",
    );
    expect(mockEmployeeFindUnique).toHaveBeenCalledTimes(1);
    expect(mockVisitorFindFirst).toHaveBeenCalledTimes(2);
  });

  it("trainee exists → subscriber/employee creates 409", async () => {
    mockVisitorFindFirst.mockResolvedValueOnce({ id: "v-trainee" });

    await expect409(
      assertPhoneNotTaken(PHONE),
      "This phone number is already registered as a trainee",
    );
    expect(mockEmployeeFindUnique).toHaveBeenCalled();
    // Trainee matched first — subscriber check never runs.
    expect(mockVisitorFindFirst).toHaveBeenCalledTimes(1);
  });

  it("employee exists → subscriber/trainee creates 409", async () => {
    mockEmployeeFindUnique.mockResolvedValue({ id: "e-1" });

    await expect409(
      assertPhoneNotTaken(PHONE),
      "This phone number is already registered as an employee",
    );
    expect(mockVisitorFindFirst).not.toHaveBeenCalled();
  });

  it("excluding a table skips only that table", async () => {
    mockEmployeeFindUnique.mockResolvedValue({ id: "e-1" });

    // Employee create path excludes nothing → 409 tested above.
    // Subscriber reactivation path excludes visitor (self-row) but an
    // employee-row collision must still fire.
    await expect409(
      assertPhoneNotTaken(PHONE, { table: "visitor" }),
      "This phone number is already registered as an employee",
    );

    // Excluding employee skips the roster check entirely.
    vi.resetAllMocks();
    mockVisitorFindFirst.mockResolvedValue(null);
    mockEmployeeFindUnique.mockResolvedValue({ id: "e-1" });
    await expect(assertPhoneNotTaken(PHONE, { table: "employee" })).resolves.toBe(
      PHONE,
    );
    expect(mockEmployeeFindUnique).not.toHaveBeenCalled();
  });
});
