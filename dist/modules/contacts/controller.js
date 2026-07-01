"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactsController = exports.ContactsController = void 0;
const service_1 = require("./service");
const schema_1 = require("./schema");
class ContactsController {
    async list(req, res, next) {
        try {
            const search = req.query.search;
            const data = await service_1.contactsService.list(search);
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async search(req, res, next) {
        try {
            const q = req.query.q ?? "";
            const data = await service_1.contactsService.search(q);
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async fuzzySearch(req, res, next) {
        try {
            const q = req.query.q ?? "";
            const data = await service_1.contactsService.fuzzySearch(q);
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async getById(req, res, next) {
        try {
            const id = req.params.id;
            const data = await service_1.contactsService.getById(id);
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async create(req, res, next) {
        try {
            const input = schema_1.createContactSchema.parse(req.body);
            const data = await service_1.contactsService.create(input);
            res.status(201).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async update(req, res, next) {
        try {
            const id = req.params.id;
            const input = schema_1.updateContactSchema.parse(req.body);
            const data = await service_1.contactsService.update(id, input);
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
    async delete(req, res, next) {
        try {
            const id = req.params.id;
            await service_1.contactsService.delete(id);
            res.status(204).json({ success: true });
        }
        catch (error) {
            next(error);
        }
    }
    async import(req, res, next) {
        try {
            const input = schema_1.importContactsSchema.parse(req.body);
            const data = await service_1.contactsService.import(input.contacts);
            res.status(200).json({ success: true, data });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.ContactsController = ContactsController;
exports.contactsController = new ContactsController();
