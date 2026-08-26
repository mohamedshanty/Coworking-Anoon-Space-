const ANOON_SYNC_TIMEOUT_MS = 5000;

export type AnoonPlanType = "WEEKLY" | "MONTHLY";

export type AnoonSyncOutcome = { ok: boolean; reason?: string };

export function mapPackageTypeToAnoon(packageType: string): AnoonPlanType {
  switch (packageType) {
    case "weekly":
      return "WEEKLY";
    case "monthly":
    case "half_month":
      return "MONTHLY";
    default:
      return "MONTHLY";
  }
}

export async function syncMemberToAnoonQr(payload: {
  name: string;
  phone: string;
  packageType: string;
  startDate: Date | string;
}): Promise<AnoonSyncOutcome> {
  try {
    const baseUrl = process.env.ANOON_QR_BASE_URL;
    const secret = process.env.INTERNAL_SYNC_SECRET;

    if (!baseUrl || !secret) {
      console.warn(
        `[AnoonSync] Skipped member sync (phone=${payload.phone}): ANOON_QR_BASE_URL or INTERNAL_SYNC_SECRET is not configured`
      );
      return { ok: false, reason: "not-configured" };
    }

    const body = {
      name: payload.name,
      phone: payload.phone,
      planType: mapPackageTypeToAnoon(payload.packageType),
      startDate: new Date(payload.startDate).toISOString(),
    };

    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/sync/member`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ANOON_SYNC_TIMEOUT_MS),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.error(
        `[AnoonSync] Member sync failed (phone=${payload.phone}, at=${new Date().toISOString()}): HTTP ${response.status} ${responseText}`.trim()
      );
      return { ok: false, reason: `http-${response.status}` };
    }

    console.log(
      `[AnoonSync] Synced member (phone=${payload.phone}, planType=${body.planType})`
    );
    return { ok: true };
  } catch (error) {
    const isTimeout =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    console.error(
      `[AnoonSync] Member sync failed (phone=${payload.phone}, at=${new Date().toISOString()}):`,
      error
    );
    return { ok: false, reason: isTimeout ? "timeout" : "network-error" };
  }
}
