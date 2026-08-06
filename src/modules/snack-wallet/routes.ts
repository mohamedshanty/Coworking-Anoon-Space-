import { Router } from "express";
import { snackWalletController } from "./controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);

// GET all wallets (paginated)
router.get(
  "/",
  authorize("محفظة السناكس", "view"),
  (req, res, next) => snackWalletController.list(req, res, next)
);

// GET wallet by ID
router.get(
  "/:id",
  authorize("محفظة السناكس", "view"),
  (req, res, next) => snackWalletController.getById(req, res, next)
);

// GET wallet by phone (lookup)
router.get(
  "/lookup/phone",
  authorize("محفظة السناكس", "view"),
  (req, res, next) => snackWalletController.lookup(req, res, next)
);

// POST create wallet
router.post(
  "/",
  authorize("محفظة السناكس", "edit"),
  (req, res, next) => snackWalletController.create(req, res, next)
);

// PATCH update wallet
router.patch(
  "/:id",
  authorize("محفظة السناكس", "edit"),
  (req, res, next) => snackWalletController.update(req, res, next)
);

// DELETE wallet
router.delete(
  "/:id",
  authorize("محفظة السناكس", "delete"),
  (req, res, next) => snackWalletController.remove(req, res, next)
);

// POST top up wallet
router.post(
  "/:id/topup",
  authorize("محفظة السناكس", "edit"),
  (req, res, next) => snackWalletController.topUp(req, res, next)
);

// GET wallet transactions (ledger)
router.get(
  "/:id/transactions",
  authorize("محفظة السناكس", "view"),
  (req, res, next) => snackWalletController.getTransactions(req, res, next)
);

export default router;
