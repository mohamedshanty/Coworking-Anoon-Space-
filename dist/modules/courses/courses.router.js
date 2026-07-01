"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/modules/courses/courses.router.ts
const express_1 = require("express");
const authenticate_1 = require("../../middleware/authenticate");
const authorize_1 = require("../../middleware/authorize");
const courses_controller_1 = require("./courses.controller");
const router = (0, express_1.Router)();
// Courses CRUD – pageKey "الدورات"
router.use(authenticate_1.authenticate);
router.use((0, authorize_1.authorize)('الدورات', 'view'));
router.get('/', courses_controller_1.CoursesController.getAll);
router.get('/:id', courses_controller_1.CoursesController.getOne);
router.post('/', (0, authorize_1.authorize)('الدورات', 'edit'), courses_controller_1.CoursesController.create);
router.patch('/:id', (0, authorize_1.authorize)('الدورات', 'edit'), courses_controller_1.CoursesController.update);
router.delete('/:id', (0, authorize_1.authorize)('الدورات', 'delete'), courses_controller_1.CoursesController.delete);
// Trainee sub‑routes
router.get('/:id/trainees', (0, authorize_1.authorize)('الدورات', 'view'), courses_controller_1.CoursesController.getTrainees);
router.post('/:id/trainees', (0, authorize_1.authorize)('الدورات', 'edit'), courses_controller_1.CoursesController.addTrainee);
router.patch('/:id/trainees/:traineeId/attendance', (0, authorize_1.authorize)('الدورات', 'edit'), courses_controller_1.CoursesController.updateAttendance);
router.patch('/:id/trainees/:traineeId', (0, authorize_1.authorize)('الدورات', 'edit'), courses_controller_1.CoursesController.updateTrainee);
router.delete('/:id/trainees/:traineeId', (0, authorize_1.authorize)('الدورات', 'delete'), courses_controller_1.CoursesController.deleteTrainee);
router.post('/:id/trainees/:traineeId/payments', (0, authorize_1.authorize)('الدورات', 'edit'), courses_controller_1.CoursesController.recordPayment);
exports.default = router;
