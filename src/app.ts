import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";
import authRouter from "./modules/auth/routes";
import sessionsRouter from "./modules/sessions/routes";
import subscribersRouter from "./modules/subscribers/routes";
import inventoryRouter from "./modules/inventory/routes";
import salesRouter from "./modules/sales/routes";
import hotDrinksRouter from "./modules/sales/hotDrinksRoutes";
import expensesRouter from "./modules/expenses/routes";
import debtsRouter from "./modules/debts/routes";
import roomsRouter from "./modules/rooms/rooms.router";
import coursesRouter from "./modules/courses/courses.router";
import followUpRouter from "./modules/followUp/routes";
import dashboardRouter from "./modules/dashboard/routes";
import reportsRouter from "./modules/reports/routes";
import settingsRouter from "./modules/settings/routes";
import staffRouter from "./modules/staff/routes";
import permissionsRouter from "./modules/staff/permRoutes";
import loginLogsRouter from "./modules/loginLogs/routes";
import contactsRouter from "./modules/contacts/routes";
import { authenticate } from "./middleware/authenticate";
import { authorize } from "./middleware/authorize";

const app = express();

app.use(cors());
app.use(express.json());

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Register auth routes
router.use("/auth", authRouter);

// Register sessions routes
router.use("/sessions", sessionsRouter);

// Register subscribers routes
router.use("/subscribers", subscribersRouter);

// Register inventory routes
router.use("/inventory", inventoryRouter);

// Register snack sales routes
router.use("/sales", salesRouter);

// Register hot drinks routes
router.use("/hot-drinks", hotDrinksRouter);

// Register expenses routes
router.use("/expenses", expensesRouter);

// Register debts routes
router.use("/debts", debtsRouter);

// Register rooms and bookings routes
router.use("/rooms", roomsRouter);

// Register courses routes
router.use("/courses", coursesRouter);

// Register follow-up routes
router.use("/follow-up", followUpRouter);

// Register dashboard routes
router.use("/dashboard", dashboardRouter);

// Register reports routes
router.use("/reports", reportsRouter);

// Register settings routes
router.use("/settings", settingsRouter);

// Register staff routes (admin-only)
router.use("/staff", staffRouter);

// Register permissions routes (admin-only)
router.use("/permissions", permissionsRouter);

// Register login-logs routes (admin-only)
router.use("/login-logs", loginLogsRouter);

// Register contacts routes
router.use("/contacts", contactsRouter);

// Test routes for middleware verification
router.get("/test-protected-view", authenticate, authorize("الرئيسية", "view"), (req, res) => {
  res.json({ success: true, message: "Authorized view!", user: req.user });
});

router.post("/test-protected-edit", authenticate, authorize("الرئيسية", "edit"), (req, res) => {
  res.json({ success: true, message: "Authorized edit!", user: req.user });
});

router.delete("/test-protected-delete", authenticate, authorize("الرئيسية", "delete"), (req, res) => {
  res.json({ success: true, message: "Authorized delete!", user: req.user });
});

app.use("/api/v1", router);

// Error Handler Middleware
app.use(errorHandler);

export default app;
