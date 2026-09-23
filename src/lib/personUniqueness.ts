import { prisma } from "./prisma";
import { ApiError } from "./ApiError";
import { normalizePhone } from "../modules/hotspot/hotspot.config";

export type PersonTable = "visitor" | "trainee" | "tamkeen" | "employee";

/**
 * Cross-table phone uniqueness.
 *
 * A phone number must belong to exactly one of: subscriber, trainee, Tamkeen
 * student, or the employee roster. Plain walk-in Visitor rows (type "visitor"
 * with no subscription history) are NOT people — they are auto-created
 * attendance anchors and never conflict.
 *
 * NOTE on "trainee"/"tamkeen": this means Visitor rows with type "trainee" /
 * "tamkeen" (the trainees / tamkeen-students modules + QR check-in concept),
 * NOT the course-enrollment Trainee model, which has no phone uniqueness and
 * is out of scope here.
 *
 * Returns the normalized phone so callers store one canonical form.
 */
export async function assertPhoneNotTaken(
  phone: string,
  excluding?: { table: PersonTable },
): Promise<string> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw new ApiError(400, "Invalid phone number — expected format 05XXXXXXXX");
  }

  // Cheapest/smallest table first. Order is irrelevant for correctness
  // (duplicates are prevented at creation time) — at most one can match.
  if (excluding?.table !== "employee") {
    const employee = await prisma.employeeRoster.findUnique({
      where: { phone: normalized },
      select: { id: true },
    });
    if (employee) {
      throw new ApiError(409, "This phone number is already registered as an employee");
    }
  }

  if (excluding?.table !== "trainee") {
    const trainee = await prisma.visitor.findFirst({
      where: { phone: normalized, type: "trainee" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (trainee) {
      throw new ApiError(409, "This phone number is already registered as a trainee");
    }
  }

  if (excluding?.table !== "tamkeen") {
    const tamkeen = await prisma.visitor.findFirst({
      where: { phone: normalized, type: "tamkeen" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (tamkeen) {
      throw new ApiError(409, "This phone number is already registered as a Tamkeen student");
    }
  }

  if (excluding?.table !== "visitor") {
    // A "subscriber" is a Visitor that is (or ever was) subscription-backed:
    // type flag OR any subscription row, past or present. Plain walk-in
    // visitor rows never conflict.
    const subscriber = await prisma.visitor.findFirst({
      where: {
        phone: normalized,
        OR: [{ type: "subscriber" }, { subscriptions: { some: {} } }],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (subscriber) {
      throw new ApiError(409, "This phone number is already registered as a subscriber");
    }
  }

  return normalized;
}
