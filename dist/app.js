"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const errorHandler_1 = require("./middleware/errorHandler");
const routes_1 = __importDefault(require("./modules/auth/routes"));
const routes_2 = __importDefault(require("./modules/sessions/routes"));
const routes_3 = __importDefault(require("./modules/subscribers/routes"));
const routes_4 = __importDefault(require("./modules/inventory/routes"));
const routes_5 = __importDefault(require("./modules/sales/routes"));
const hotDrinksRoutes_1 = __importDefault(require("./modules/sales/hotDrinksRoutes"));
const routes_6 = __importDefault(require("./modules/expenses/routes"));
const routes_7 = __importDefault(require("./modules/debts/routes"));
const rooms_router_1 = __importDefault(require("./modules/rooms/rooms.router"));
const courses_router_1 = __importDefault(require("./modules/courses/courses.router"));
const routes_8 = __importDefault(require("./modules/followUp/routes"));
const routes_9 = __importDefault(require("./modules/dashboard/routes"));
const routes_10 = __importDefault(require("./modules/reports/routes"));
const routes_11 = __importDefault(require("./modules/settings/routes"));
const routes_12 = __importDefault(require("./modules/staff/routes"));
const permRoutes_1 = __importDefault(require("./modules/staff/permRoutes"));
const routes_13 = __importDefault(require("./modules/loginLogs/routes"));
const routes_14 = __importDefault(require("./modules/contacts/routes"));
const authenticate_1 = require("./middleware/authenticate");
const authorize_1 = require("./middleware/authorize");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const router = express_1.default.Router();
router.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Register auth routes
router.use("/auth", routes_1.default);
// Register sessions routes
router.use("/sessions", routes_2.default);
// Register subscribers routes
router.use("/subscribers", routes_3.default);
// Register inventory routes
router.use("/inventory", routes_4.default);
// Register snack sales routes
router.use("/sales", routes_5.default);
// Register hot drinks routes
router.use("/hot-drinks", hotDrinksRoutes_1.default);
// Register expenses routes
router.use("/expenses", routes_6.default);
// Register debts routes
router.use("/debts", routes_7.default);
// Register rooms and bookings routes
router.use("/rooms", rooms_router_1.default);
// Register courses routes
router.use("/courses", courses_router_1.default);
// Register follow-up routes
router.use("/follow-up", routes_8.default);
// Register dashboard routes
router.use("/dashboard", routes_9.default);
// Register reports routes
router.use("/reports", routes_10.default);
// Register settings routes
router.use("/settings", routes_11.default);
// Register staff routes (admin-only)
router.use("/staff", routes_12.default);
// Register permissions routes (admin-only)
router.use("/permissions", permRoutes_1.default);
// Register login-logs routes (admin-only)
router.use("/login-logs", routes_13.default);
// Register contacts routes
router.use("/contacts", routes_14.default);
// Test routes for middleware verification
router.get("/test-protected-view", authenticate_1.authenticate, (0, authorize_1.authorize)("الرئيسية", "view"), (req, res) => {
    res.json({ success: true, message: "Authorized view!", user: req.user });
});
router.post("/test-protected-edit", authenticate_1.authenticate, (0, authorize_1.authorize)("الرئيسية", "edit"), (req, res) => {
    res.json({ success: true, message: "Authorized edit!", user: req.user });
});
router.delete("/test-protected-delete", authenticate_1.authenticate, (0, authorize_1.authorize)("الرئيسية", "delete"), (req, res) => {
    res.json({ success: true, message: "Authorized delete!", user: req.user });
});
app.use("/api/v1", router);
// Error Handler Middleware
app.use(errorHandler_1.errorHandler);
exports.default = app;
