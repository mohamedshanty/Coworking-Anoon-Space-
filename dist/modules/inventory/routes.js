"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const controller_1 = require("./controller");
const authenticate_1 = require("../../middleware/authenticate");
const authorize_1 = require("../../middleware/authorize");
const router = (0, express_1.Router)();
router.use(authenticate_1.authenticate);
// GET inventory list
router.get("/", (0, authorize_1.authorize)("المخزون", "view"), (req, res, next) => controller_1.inventoryController.getInventory(req, res, next));
// POST create item
router.post("/", (0, authorize_1.authorize)("المخزون", "edit"), (req, res, next) => controller_1.inventoryController.createItem(req, res, next));
// POST restock item quantity
router.post("/:id/restock", (0, authorize_1.authorize)("المخزون", "edit"), (req, res, next) => controller_1.inventoryController.restockItem(req, res, next));
// PATCH edit details
router.patch("/:id", (0, authorize_1.authorize)("المخزون", "edit"), (req, res, next) => controller_1.inventoryController.editItem(req, res, next));
// DELETE remove item
router.delete("/:id", (0, authorize_1.authorize)("المخزون", "delete"), (req, res, next) => controller_1.inventoryController.deleteItem(req, res, next));
exports.default = router;
