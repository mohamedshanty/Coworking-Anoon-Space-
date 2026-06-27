import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/ApiError";
import { UpdateSettingsInput } from "./schema";

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export class SettingsService {
  async getSettings() {
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      return prisma.settings.create({
        data: {
          id: "default",
          hourlyRate: 0,
          fullDayPrice: 0,
          fullDayThresholdHours: 6,
          hotDrinksMonthlyCost: 0,
          company: { name: "", phone: "", email: "", address: "" },
        },
      });
    }
    return settings;
  }

  async updateSettings(data: UpdateSettingsInput) {
    const settings = await this.getSettings();

    const updateData: any = {};
    if (data.hourlyRate !== undefined) updateData.hourlyRate = r2(data.hourlyRate);
    if (data.fullDayPrice !== undefined) updateData.fullDayPrice = r2(data.fullDayPrice);
    if (data.fullDayThresholdHours !== undefined) updateData.fullDayThresholdHours = data.fullDayThresholdHours;
    if (data.hotDrinksMonthlyCost !== undefined) updateData.hotDrinksMonthlyCost = r2(data.hotDrinksMonthlyCost);
    if (data.company !== undefined) {
      const current = settings.company as Record<string, any>;
      updateData.company = { ...current, ...data.company };
    }

    return prisma.settings.update({
      where: { id: settings.id },
      data: updateData,
    });
  }
}

export const settingsService = new SettingsService();
