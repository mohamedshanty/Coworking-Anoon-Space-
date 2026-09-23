export interface PricingSettings {
  hourlyRate: number;
  fullDayPrice: number;
  fullDayThresholdHours: number;
}

export interface InternetCharge {
  amount: number;
  minutes: number;
  tier: string;
  /** In "replaces" mode the seat price is zeroed — the internet charge IS the time cost. */
  replacesSeat?: boolean;
}

/**
 * Person types whose seat-time is always free, regardless of subscription
 * status: trainees, employees, and Tamkeen students ("tamkeen"). Their
 * package/training already covers space usage — sessions only log the visit
 * (visitCount++) and any snack/internet extras. Subscribers are NOT covered
 * here because they need an *active* subscription (checked by the caller).
 */
export function isTimeExemptType(visitorType: string | null | undefined): boolean {
  return (
    visitorType === "trainee" ||
    visitorType === "employee" ||
    visitorType === "tamkeen"
  );
}

export function calculateSessionPricing(
  checkIn: Date,
  visitorType: string,
  hasActiveSubscription: boolean,
  snackOrders: { total: number | string | any }[],
  settings: PricingSettings,
  checkOut?: Date | null,
  internetCharge?: InternetCharge | null,
) {
  const checkInTime = new Date(checkIn).getTime();
  const endTime = checkOut ? new Date(checkOut).getTime() : Date.now();
  const elapsedMs = Math.max(0, endTime - checkInTime);
  const hours = elapsedMs / (1000 * 60 * 60);

  // Despite the name "isSub", this flag now also covers trainees, employees,
  // and Tamkeen students getting free time. Trainees/Tamkeen students are
  // checked in as "trainee"/"tamkeen" type by staff and don't pay hourly —
  // their training package already covers the space usage.
  const isSub =
    (visitorType === "subscriber" && hasActiveSubscription) ||
    isTimeExemptType(visitorType);

  // Time cost calculation
  // In "replaces" mode for non-subscribers: time portion is zeroed —
  // the internet charge becomes the sole time cost.
  const replacesSeat = !isSub && internetCharge?.replacesSeat;
  const timeAmountRaw = replacesSeat
    ? 0
    : isSub
      ? 0
      : Math.min(hours * Number(settings.hourlyRate), Number(settings.fullDayPrice));
  const timeAmount = Math.round((timeAmountRaw + Number.EPSILON) * 100) / 100;

  // Orders cost calculation
  const ordersAmountRaw = snackOrders.reduce((sum, order) => {
    return sum + Number(order.total);
  }, 0);
  const ordersAmount = Math.round((ordersAmountRaw + Number.EPSILON) * 100) / 100;

  // Internet charge (surcharge on top, or replaces seat in "replaces" mode)
  const internetAmount = internetCharge?.amount ?? 0;

  const totalAmount = Math.round(
    (timeAmount + ordersAmount + internetAmount + Number.EPSILON) * 100,
  ) / 100;

  return {
    hours,
    isSub,
    timeAmount,
    ordersAmount,
    internetAmount,
    totalAmount,
  };
}
