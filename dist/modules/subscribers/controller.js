"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribersController = exports.SubscribersController = void 0;
const service_1 = require("./service");
const schema_1 = require("./schema");
class SubscribersController {
    async getSubscribers(req, res, next) {
        try {
            const data = await service_1.subscribersService.getSubscribers();
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async createSubscriber(req, res, next) {
        try {
            const input = schema_1.createSubscriberSchema.parse(req.body);
            const result = await service_1.subscribersService.createSubscriber(input);
            res.status(201).json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async renewSubscription(req, res, next) {
        try {
            const id = req.params.id;
            const input = schema_1.renewSubscriptionSchema.parse(req.body);
            const data = await service_1.subscribersService.renewSubscription(id, input);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async pauseSubscription(req, res, next) {
        try {
            const id = req.params.id;
            const data = await service_1.subscribersService.pauseSubscription(id);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async updateSubscriber(req, res, next) {
        try {
            const id = req.params.id;
            const input = schema_1.updateSubscriberSchema.parse(req.body);
            const data = await service_1.subscribersService.updateSubscriber(id, input);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.SubscribersController = SubscribersController;
exports.subscribersController = new SubscribersController();
