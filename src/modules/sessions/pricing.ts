export interface PricingSettings {
  hourlyRate: number;
  fullDayPrice: number;
  fullDayThresholdHours: number;
}

export function calculateSessionPricing(
  checkIn: Date,
  visitorType: string,
  hasActiveSubscription: boolean,
  snackOrders: { total: number | string | any }[],
  settings: PricingSettings
) {
  const checkInTime = new Date(checkIn).getTime();
  const now = Date.now();
  const elapsedMs = Math.max(0, now - checkInTime);
  const hours = elapsedMs / (1000 * 60 * 60);

  // Despite the name "isSub", this flag now also covers trainees getting free time.
  // Trainees are checked in as "trainee" type by staff and don't pay hourly — their
  // training package/course already covers the space usage.
  const isSub =
    (visitorType === "subscriber" && hasActiveSubscription) ||
    visitorType === "trainee";

  // Time cost calculation
  const timeAmountRaw = isSub
    ? 0
    : Math.min(hours * Number(settings.hourlyRate), Number(settings.fullDayPrice));
  const timeAmount = Math.round((timeAmountRaw + Number.EPSILON) * 100) / 100;

  // Orders cost calculation
  const ordersAmountRaw = snackOrders.reduce((sum, order) => {
    return sum + Number(order.total);
  }, 0);
  const ordersAmount = Math.round((ordersAmountRaw + Number.EPSILON) * 100) / 100;

  const totalAmount = Math.round((timeAmount + ordersAmount + Number.EPSILON) * 100) / 100;

  return {
    hours,
    isSub,
    timeAmount,
    ordersAmount,
    totalAmount,
  };
}
