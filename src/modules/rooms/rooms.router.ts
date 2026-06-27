// src/modules/rooms/rooms.router.ts
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { RoomsController } from './rooms.controller';
import { BookingsController } from './bookings.controller';

const router = Router();

// Rooms CRUD – pageKey "القاعات"
router.use(authenticate);
router.use(authorize('القاعات', 'view'));
router.get('/', RoomsController.getAll);
router.get('/:id', RoomsController.getOne);
router.post('/', authorize('القاعات', 'edit'), RoomsController.create);
router.patch('/:id', authorize('القاعات', 'edit'), RoomsController.update);
router.delete('/:id', authorize('القاعات', 'delete'), RoomsController.delete);

// Bookings endpoints – same pageKey (static routes BEFORE :id param)
router.get('/bookings', authorize('القاعات', 'view'), BookingsController.getAll);
router.get('/bookings/check-conflict', authorize('القاعات', 'view'), BookingsController.checkConflict);
router.get('/bookings/:id', authorize('القاعات', 'view'), BookingsController.getOne);
router.post('/bookings', authorize('القاعات', 'edit'), BookingsController.create);
router.patch('/bookings/:id', authorize('القاعات', 'edit'), BookingsController.update);
router.delete('/bookings/:id', authorize('القاعات', 'delete'), BookingsController.delete);

export default router;
