"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/rooms/rooms.router.ts
const express_1 = require("express");
const authenticate_1 = require("../../middleware/authenticate");
const authorize_1 = require("../../middleware/authorize");
const rooms_controller_1 = require("./rooms.controller");
const bookings_controller_1 = require("./bookings.controller");
const router = (0, express_1.Router)();
// Rooms CRUD – pageKey "القاعات"
router.use(authenticate_1.authenticate);
router.use((0, authorize_1.authorize)('القاعات', 'view'));
router.get('/', rooms_controller_1.RoomsController.getAll);
router.post('/', (0, authorize_1.authorize)('القاعات', 'edit'), rooms_controller_1.RoomsController.create);
// Bookings endpoints – same pageKey (static routes BEFORE :id param)
router.get('/bookings', (0, authorize_1.authorize)('القاعات', 'view'), bookings_controller_1.BookingsController.getAll);
router.get('/bookings/check-conflict', (0, authorize_1.authorize)('القاعات', 'view'), bookings_controller_1.BookingsController.checkConflict);
router.get('/bookings/:id', (0, authorize_1.authorize)('القاعات', 'view'), bookings_controller_1.BookingsController.getOne);
router.post('/bookings', (0, authorize_1.authorize)('القاعات', 'edit'), bookings_controller_1.BookingsController.create);
router.patch('/bookings/:id', (0, authorize_1.authorize)('القاعات', 'edit'), bookings_controller_1.BookingsController.update);
router.delete('/bookings/:id', (0, authorize_1.authorize)('القاعات', 'delete'), bookings_controller_1.BookingsController.delete);
// Room single-item routes AFTER static routes
router.get('/:id', rooms_controller_1.RoomsController.getOne);
router.patch('/:id', (0, authorize_1.authorize)('القاعات', 'edit'), rooms_controller_1.RoomsController.update);
router.delete('/:id', (0, authorize_1.authorize)('القاعات', 'delete'), rooms_controller_1.RoomsController.delete);
exports.default = router;
