import { Router } from "express";
import { inventoryController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET inventory list
router.get(
  "/",
  authorize("المخزون", "view"),
  (req, res, next) => inventoryController.getInventory(req, res, next)
);

// POST create item
router.post(
  "/",
  authorize("المخزون", "edit"),
  (req, res, next) => inventoryController.createItem(req, res, next)
);

// POST restock item quantity
router.post(
  "/:id/restock",
  authorize("المخزون", "edit"),
  (req, res, next) => inventoryController.restockItem(req, res, next)
);

// PATCH edit details
router.patch(
  "/:id",
  authorize("المخزون", "edit"),
  (req, res, next) => inventoryController.editItem(req, res, next)
);

// DELETE remove item
router.delete(
  "/:id",
  authorize("المخزون", "delete"),
  (req, res, next) => inventoryController.deleteItem(req, res, next)
);

export default router;
