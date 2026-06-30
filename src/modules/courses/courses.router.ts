// src/modules/courses/courses.router.ts
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { CoursesController } from './courses.controller';

const router = Router();

// Courses CRUD – pageKey "الدورات"
router.use(authenticate);
router.use(authorize('الدورات', 'view'));
router.get('/', CoursesController.getAll);
router.get('/:id', CoursesController.getOne);
router.post('/', authorize('الدورات', 'edit'), CoursesController.create);
router.patch('/:id', authorize('الدورات', 'edit'), CoursesController.update);
router.delete('/:id', authorize('الدورات', 'delete'), CoursesController.delete);

// Trainee sub‑routes
router.get('/:id/trainees', authorize('الدورات', 'view'), CoursesController.getTrainees);
router.post('/:id/trainees', authorize('الدورات', 'edit'), CoursesController.addTrainee);
router.patch('/:id/trainees/:traineeId/attendance', authorize('الدورات', 'edit'), CoursesController.updateAttendance);
router.patch('/:id/trainees/:traineeId', authorize('الدورات', 'edit'), CoursesController.updateTrainee);
router.delete('/:id/trainees/:traineeId', authorize('الدورات', 'delete'), CoursesController.deleteTrainee);
router.post('/:id/trainees/:traineeId/payments', authorize('الدورات', 'edit'), CoursesController.recordPayment);

export default router;
