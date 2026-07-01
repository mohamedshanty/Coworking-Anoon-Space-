"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsService = exports.SettingsService = void 0;
const prisma_1 = require("../../lib/prisma");
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
class SettingsService {
    async getSettings() {
        const settings = await prisma_1.prisma.settings.findFirst();
        if (!settings) {
            return prisma_1.prisma.settings.create({
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
    async updateSettings(data) {
        const settings = await this.getSettings();
        const updateData = {};
        if (data.hourlyRate !== undefined)
            updateData.hourlyRate = r2(data.hourlyRate);
        if (data.fullDayPrice !== undefined)
            updateData.fullDayPrice = r2(data.fullDayPrice);
        if (data.fullDayThresholdHours !== undefined)
            updateData.fullDayThresholdHours = data.fullDayThresholdHours;
        if (data.hotDrinksMonthlyCost !== undefined)
            updateData.hotDrinksMonthlyCost = r2(data.hotDrinksMonthlyCost);
        if (data.company !== undefined) {
            const current = settings.company;
            updateData.company = { ...current, ...data.company };
        }
        return prisma_1.prisma.settings.update({
            where: { id: settings.id },
            data: updateData,
        });
    }
}
exports.SettingsService = SettingsService;
exports.settingsService = new SettingsService();
