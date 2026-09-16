import { z } from "zod";

export const anoonCheckInSchema = z
  .object({
    // Two-tab Anoon QR: "member" (backend resolves subscriber/trainee/
    // employee) or "visitor" (auto-created). The three legacy values are
    // still accepted and mapped to the member path for backward
    // compatibility with older kiosk builds. Missing type = legacy
    // payload → subscriber → member path.
    type: z
      .enum(["member", "visitor", "subscriber", "trainee", "employee"])
      .default("subscriber"),
    // Required for visitors (walk-ins need a display name); optional for
    // the member path — noonCowork already has the real name on file
    // (subscriber/trainee/employee record), so the kiosk's "member" tab
    // only asks for a phone number.
    name: z.string().min(1).optional(),
    phone: z.string().min(1),
    // Only visitors may select a speed; members are forced to noon-10m
    // in the service layer regardless of what is sent here.
    internetSpeed: z.enum(["10M", "20M", "30M"]).optional(),
    routerProfile: z.string().optional(),
    source: z.string().optional(),
    clientCheckinId: z.string().optional(),
    // Optional hotspot device fields, forwarded by the Anoon Kiosk only when
    // the check-in device was reached via the MikroTik hotspot redirect
    // (same $(mac)/$(ip) values the noonCowork portal uses).
    // Deliberately plain strings (no regex): malformed values must NOT fail
    // validation — the service skips authorization gracefully and the
    // check-in itself still succeeds (backward compatible).
    mac: z.string().optional(),
    ip: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "visitor" && !data.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "name is required for visitor check-ins",
      });
    }
  });

export type AnoonCheckInInput = z.infer<typeof anoonCheckInSchema>;

export const anoonVisitorCheckInSchema = z.object({
  phone: z.string().min(1),
  name: z.string().min(1),
});

export type AnoonVisitorCheckInInput = z.infer<
  typeof anoonVisitorCheckInSchema
>;

// Guest quick-login (walk-in guests, NOT tracked as persons).
// The Kiosk forwards mac/ip from the router redirect plus the code
// the guest typed. The backend maps the code to a fixed shared
// hotspot account (code == username == password) from its own
// whitelist — arbitrary credentials from the frontend are never trusted.
export const guestQuickLoginSchema = z.object({
  code: z.string().trim().min(1, "Guest code is required").max(16),
  mac: z
    .string()
    .regex(/^[0-9a-fA-F:.\-]{12,17}$/, "Invalid MAC address"),
  ip: z
    .string()
    .regex(/^(\d{1,3}\.){3}\d{1,3}$/, "Invalid IP address")
    .optional(),
});

export type GuestQuickLoginInput = z.infer<typeof guestQuickLoginSchema>;
