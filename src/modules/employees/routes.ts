import { Router } from "express";
import { employeesController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET employees list (?active=true|false)
router.get(
  "/",
  authorize("الموظفون", "view"),
  (req, res, next) => employeesController.listEmployees(req, res, next)
);

// POST create employee (name + phone)
router.post(
  "/",
  authorize("الموظفون", "edit"),
  (req, res, next) => employeesController.createEmployee(req, res, next)
);

// PATCH update employee (name / active)
router.patch(
  "/:id",
  authorize("الموظفون", "edit"),
  (req, res, next) => employeesController.updateEmployee(req, res, next)
);

// DELETE employee (hard delete — roster entry, no dependents)
router.delete(
  "/:id",
  authorize("الموظفون", "delete"),
  (req, res, next) => employeesController.deleteEmployee(req, res, next)
);

export default router;
