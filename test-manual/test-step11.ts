import http from "http";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = 5993;
const PFX = "stf_";
const day = 86_400_000;

async function test() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  let passed = 0;
  let failed = 0;
  function check(name: string, condition: boolean, detail: string) {
    if (condition) { passed++; console.log("  PASS: " + name + " - " + detail); }
    else { failed++; console.log("  FAIL: " + name + " - " + detail); }
  }
  function hasPasswordHash(obj: any): boolean {
    if (obj === null || obj === undefined) return false;
    if (typeof obj === "object" && !Array.isArray(obj)) return "passwordHash" in obj;
    if (Array.isArray(obj)) return obj.some((item) => hasPasswordHash(item));
    return false;
  }

  try {
    const stfUsers = await prisma.staff.findMany({ where: { username: { startsWith: PFX } }, select: { id: true } });
    const stfIds = stfUsers.map(s => s.id);
    if (stfIds.length > 0) {
      await prisma.permission.deleteMany({ where: { staffId: { in: stfIds } } });
      await prisma.staff.deleteMany({ where: { id: { in: stfIds } } });
    }

    const loginRes = await fetch(`http://localhost:${PORT}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    const loginData = (await loginRes.json()) as any;
    const token = loginData.accessToken;
    const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // ================================================================
    // TEST 1: SETTINGS
    // ================================================================
    console.log("TEST 1: Settings GET and PATCH");

    const gs = await fetch(`http://localhost:${PORT}/api/v1/settings`, { headers: H });
    const gsBody = (await gs.json()) as any;
    check("GET settings HTTP 200", gs.status === 200, "status=" + gs.status);
    check("GET settings has hourlyRate", typeof gsBody.data.hourlyRate === "string" || typeof gsBody.data.hourlyRate === "number", "type=" + typeof gsBody.data.hourlyRate);
    check("GET settings has company", typeof gsBody.data.company === "object", "type=" + typeof gsBody.data.company);

    const ps = await fetch(`http://localhost:${PORT}/api/v1/settings`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ hourlyRate: 12.555, fullDayPrice: 60.333, hotDrinksMonthlyCost: 450.777, company: { name: "Test Company", phone: "12345" } }),
    });
    const psBody = (await ps.json()) as any;
    check("PATCH settings HTTP 200", ps.status === 200, "status=" + ps.status);
    check("hourlyRate rounded to 12.56", Number(psBody.data.hourlyRate) === 12.56, "val=" + psBody.data.hourlyRate);
    check("fullDayPrice rounded to 60.33", Number(psBody.data.fullDayPrice) === 60.33, "val=" + psBody.data.fullDayPrice);
    check("hotDrinksMonthlyCost rounded to 450.78", Number(psBody.data.hotDrinksMonthlyCost) === 450.78, "val=" + psBody.data.hotDrinksMonthlyCost);
    check("company name updated", (psBody.data.company as any).name === "Test Company", "val=" + (psBody.data.company as any).name);
    check("company phone merged", (psBody.data.company as any).phone === "12345", "val=" + (psBody.data.company as any).phone);

    const vs = await fetch(`http://localhost:${PORT}/api/v1/settings`, { headers: H });
    const vsBody = (await vs.json()) as any;
    check("GET after PATCH reflects changes", Number(vsBody.data.hourlyRate) === 12.56, "val=" + vsBody.data.hourlyRate);

    await fetch(`http://localhost:${PORT}/api/v1/settings`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ hourlyRate: 10, fullDayPrice: 50, hotDrinksMonthlyCost: 400, company: { name: "مساحة العمل المشترك", phone: "022-345678", email: "info@workspace.ps", address: "رام الله، فلسطين" } }),
    });

    // ================================================================
    // TEST 2: STAFF CRUD
    // ================================================================
    console.log("\nTEST 2: Staff CRUD (no passwordHash leaks)");

    const cs = await fetch(`http://localhost:${PORT}/api/v1/staff`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "موظف اختبار", username: `${PFX}user1`, role: "staff", password: "test123456" }),
    });
    const csBody = (await cs.json()) as any;
    check("POST /staff HTTP 201", cs.status === 201, "status=" + cs.status);
    check("created staff has no passwordHash", !hasPasswordHash(csBody.data), "hasPW=" + hasPasswordHash(csBody.data));
    check("created staff name correct", csBody.data.name === "موظف اختبار", "name=" + csBody.data.name);
    check("created staff role correct", csBody.data.role === "staff", "role=" + csBody.data.role);
    const createdStaffId = csBody.data.id;

    const ls = await fetch(`http://localhost:${PORT}/api/v1/staff`, { headers: H });
    const lsBody = (await ls.json()) as any;
    check("GET /staff HTTP 200", ls.status === 200, "status=" + ls.status);
    check("staff list has no passwordHash", !hasPasswordHash(lsBody.data), "hasPW=" + hasPasswordHash(lsBody.data));
    check("staff list includes created staff", lsBody.data.some((s: any) => s.id === createdStaffId), "found=true");

    const ss = await fetch(`http://localhost:${PORT}/api/v1/staff/${createdStaffId}`, { headers: H });
    const ssBody = (await ss.json()) as any;
    check("GET /staff/:id HTTP 200", ss.status === 200, "status=" + ss.status);
    check("single staff has no passwordHash", !hasPasswordHash(ssBody.data), "hasPW=" + hasPasswordHash(ssBody.data));

    const us = await fetch(`http://localhost:${PORT}/api/v1/staff/${createdStaffId}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ name: "موظف محدث", password: "newpass123456" }),
    });
    const usBody = (await us.json()) as any;
    check("PATCH /staff/:id HTTP 200", us.status === 200, "status=" + us.status);
    check("updated staff has no passwordHash", !hasPasswordHash(usBody.data), "hasPW=" + hasPasswordHash(usBody.data));
    check("updated name", usBody.data.name === "موظف محدث", "name=" + usBody.data.name);

    const nl = await fetch(`http://localhost:${PORT}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: `${PFX}user1`, password: "newpass123456" }),
    });
    check("login with new password works", nl.status === 200, "status=" + nl.status);

    const ds = await fetch(`http://localhost:${PORT}/api/v1/staff`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "تكرار", username: `${PFX}user1`, role: "staff", password: "test123456" }),
    });
    check("duplicate username returns 409", ds.status === 409, "status=" + ds.status);

    const dd = await fetch(`http://localhost:${PORT}/api/v1/staff/${createdStaffId}`, { method: "DELETE", headers: H });
    check("DELETE /staff/:id HTTP 200", dd.status === 200, "status=" + dd.status);

    const ad = await fetch(`http://localhost:${PORT}/api/v1/staff/${createdStaffId}`, { headers: H });
    check("GET deleted staff returns 404", ad.status === 404, "status=" + ad.status);

    // ================================================================
    // TEST 3: PERMISSIONS MATRIX
    // ================================================================
    console.log("\nTEST 3: Permissions matrix get/update");

    const permStaff = await fetch(`http://localhost:${PORT}/api/v1/staff`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "موظف صلاحيات", username: `${PFX}permstaff`, role: "staff", password: "test123456" }),
    });
    const permStaffBody = (await permStaff.json()) as any;
    const permStaffId = permStaffBody.data.id;

    const gp = await fetch(`http://localhost:${PORT}/api/v1/permissions/${permStaffId}`, { headers: H });
    const gpBody = (await gp.json()) as any;
    check("GET /permissions/:staffId HTTP 200", gp.status === 200, "status=" + gp.status);
    check("permissions is array", Array.isArray(gpBody.data), "isArray=" + Array.isArray(gpBody.data));
    check("permissions has all 14 pages", gpBody.data.length === 14, "count=" + gpBody.data.length);
    check("each entry has pageKey, canView, canEdit, canDelete",
      gpBody.data.every((p: any) => typeof p.pageKey === "string" && typeof p.canView === "boolean" && typeof p.canEdit === "boolean" && typeof p.canDelete === "boolean"),
      "structure valid");
    check("new staff has all false permissions",
      gpBody.data.every((p: any) => p.canView === false && p.canEdit === false && p.canDelete === false),
      "all false");

    const pp = await fetch(`http://localhost:${PORT}/api/v1/permissions/${permStaffId}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({
        permissions: [
          { pageKey: "الرئيسية", canView: true, canEdit: false, canDelete: false },
          { pageKey: "التقارير", canView: true, canEdit: false, canDelete: false },
          { pageKey: "الإعدادات", canView: false, canEdit: false, canDelete: false },
        ],
      }),
    });
    const ppBody = (await pp.json()) as any;
    check("PATCH /permissions/:staffId HTTP 200", pp.status === 200, "status=" + pp.status);

    const vp = await fetch(`http://localhost:${PORT}/api/v1/permissions/${permStaffId}`, { headers: H });
    const vpBody = (await vp.json()) as any;
    const homepage = vpBody.data.find((p: any) => p.pageKey === "الرئيسية");
    const reportsPage = vpBody.data.find((p: any) => p.pageKey === "التقارير");
    const otherPage = vpBody.data.find((p: any) => p.pageKey === "المخزون");
    check("الرئيسية canView=true after patch", homepage?.canView === true, "canView=" + homepage?.canView);
    check("التقارير canView=true after patch", reportsPage?.canView === true, "canView=" + reportsPage?.canView);
    check("المخزون still false (not patched)", otherPage?.canView === false, "canView=" + otherPage?.canView);

    const ip = await fetch(`http://localhost:${PORT}/api/v1/permissions/nonexistent`, { headers: H });
    check("invalid staffId returns 404", ip.status === 404, "status=" + ip.status);

    // ================================================================
    // TEST 4: LOGIN LOGS
    // ================================================================
    console.log("\nTEST 4: Login logs with filtering");

    const ll = await fetch(`http://localhost:${PORT}/api/v1/login-logs`, { headers: H });
    const llBody = (await ll.json()) as any;
    check("GET /login-logs HTTP 200", ll.status === 200, "status=" + ll.status);
    check("logs response has data array", Array.isArray(llBody.data), "isArray=" + Array.isArray(llBody.data));
    check("logs response has pagination", !!llBody.pagination, "hasPagination=" + !!llBody.pagination);
    check("pagination has total", typeof llBody.pagination.total === "number", "total=" + llBody.pagination.total);
    check("pagination has page", typeof llBody.pagination.page === "number", "page=" + llBody.pagination.page);
    check("pagination has totalPages", typeof llBody.pagination.totalPages === "number", "totalPages=" + llBody.pagination.totalPages);
    check("logs has at least 1 entry", llBody.data.length >= 1, "count=" + llBody.data.length);

    if (llBody.data.length > 0) {
      const logEntry = llBody.data[0];
      check("log entry has id", typeof logEntry.id === "string", "id=" + logEntry.id);
      check("log entry has username", typeof logEntry.username === "string", "username=" + logEntry.username);
      check("log entry has at", typeof logEntry.at === "string", "at=" + logEntry.at);
      check("log entry has status", ["success", "fail"].includes(logEntry.status), "status=" + logEntry.status);
      check("log entry has ip", typeof logEntry.ip === "string", "ip=" + logEntry.ip);
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const fl = await fetch(`http://localhost:${PORT}/api/v1/login-logs?from=${todayStr}&to=${todayStr}`, { headers: H });
    const flBody = (await fl.json()) as any;
    check("filtered logs HTTP 200", fl.status === 200, "status=" + fl.status);
    check("filtered logs have today's entries", flBody.data.length >= 1, "count=" + flBody.data.length);

    const pl = await fetch(`http://localhost:${PORT}/api/v1/login-logs?page=1&limit=2`, { headers: H });
    const plBody = (await pl.json()) as any;
    check("paginated logs HTTP 200", pl.status === 200, "status=" + pl.status);
    check("paginated logs limit respected", plBody.data.length <= 2, "count=" + plBody.data.length);

    // ================================================================
    // TEST 5: AUTHORIZATION
    // ================================================================
    console.log("\nTEST 5: Authorization - non-admin blocked from staff/permissions");

    const noorLogin = await fetch(`http://localhost:${PORT}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "noor", password: "password123" }),
    });
    const noorData = (await noorLogin.json()) as any;
    const noorH = { "Content-Type": "application/json", Authorization: `Bearer ${noorData.accessToken}` };

    check("noor GET /staff blocked (403)", (await fetch(`http://localhost:${PORT}/api/v1/staff`, { headers: noorH })).status === 403, "ok");
    check("noor POST /staff blocked (403)", (await fetch(`http://localhost:${PORT}/api/v1/staff`, { method: "POST", headers: noorH, body: JSON.stringify({ name: "test", username: "test_noor", role: "staff", password: "test123456" }) })).status === 403, "ok");
    check("noor PATCH /staff/:id blocked (403)", (await fetch(`http://localhost:${PORT}/api/v1/staff/u2`, { method: "PATCH", headers: noorH, body: JSON.stringify({ name: "hacked" }) })).status === 403, "ok");
    check("noor DELETE /staff/:id blocked (403)", (await fetch(`http://localhost:${PORT}/api/v1/staff/u2`, { method: "DELETE", headers: noorH })).status === 403, "ok");
    check("noor GET /permissions blocked (403)", (await fetch(`http://localhost:${PORT}/api/v1/permissions/u2`, { headers: noorH })).status === 403, "ok");
    check("noor PATCH /permissions blocked (403)", (await fetch(`http://localhost:${PORT}/api/v1/permissions/u2`, { method: "PATCH", headers: noorH, body: JSON.stringify({ permissions: [{ pageKey: "الرئيسية", canView: true, canEdit: true, canDelete: true }] }) })).status === 403, "ok");
    check("noor GET /login-logs blocked (403)", (await fetch(`http://localhost:${PORT}/api/v1/login-logs`, { headers: noorH })).status === 403, "ok");

    await fetch(`http://localhost:${PORT}/api/v1/permissions/u3`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ permissions: [{ pageKey: "الإعدادات", canView: true, canEdit: true, canDelete: false }] }),
    });
    check("noor still blocked from staff even with canEdit on الإعدادات",
      (await fetch(`http://localhost:${PORT}/api/v1/staff`, { headers: noorH })).status === 403, "ok");

    const noorSettings = await fetch(`http://localhost:${PORT}/api/v1/settings`, { headers: noorH });
    check("noor CAN access settings with canView on الإعدادات", noorSettings.status === 200, "status=" + noorSettings.status);

    await fetch(`http://localhost:${PORT}/api/v1/permissions/u3`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ permissions: [{ pageKey: "الإعدادات", canView: true, canEdit: false, canDelete: false }] }),
    });

    // Cleanup all test staff (IDs are UUIDs, can't prefix-match)
    const testStaffIds = (await prisma.staff.findMany({ where: { username: { startsWith: PFX } }, select: { id: true } })).map(s => s.id);
    if (testStaffIds.length > 0) {
      await prisma.permission.deleteMany({ where: { staffId: { in: testStaffIds } } });
      await prisma.staff.deleteMany({ where: { id: { in: testStaffIds } } });
    }

    // ================================================================
    // TEST 6: REGRESSION
    // ================================================================
    console.log("\nTEST 6: Regression - running step 7, 8, 9, 10 tests");

    // Step 7: Rooms, Bookings
    console.log("  6a: Step 7 regression");
    const regRoom = await prisma.room.create({ data: { name: "اخت11_قاعة" } });
    const bs = new Date(); bs.setHours(14, 0, 0, 0);
    const be = new Date(bs); be.setHours(16, 0, 0, 0);
    const rb = await fetch(`http://localhost:${PORT}/api/v1/rooms/bookings`, {
      method: "POST", headers: H,
      body: JSON.stringify({ roomId: regRoom.id, bookerName: "اخت11_محاضر", bookerPhone: "0599981100", purpose: "إعادة", startTime: bs.toISOString(), endTime: be.toISOString(), price: 100, status: "confirmed" }),
    });
    check("step7: booking created", rb.status === 201, "status=" + rb.status);

    const ol = new Date(bs); ol.setHours(15, 0, 0, 0);
    const ole = new Date(bs); ole.setHours(17, 0, 0, 0);
    const cr = await fetch(`http://localhost:${PORT}/api/v1/rooms/bookings`, {
      method: "POST", headers: H,
      body: JSON.stringify({ roomId: regRoom.id, bookerName: "اخت11_تداخل", bookerPhone: "0599981101", purpose: "تداخل", startTime: ol.toISOString(), endTime: ole.toISOString(), price: 120, status: "confirmed" }),
    });
    check("step7: overlap rejected", cr.status === 409, "status=" + cr.status);
    await prisma.booking.deleteMany({ where: { bookerName: { startsWith: "اخت11_" } } });
    await prisma.room.deleteMany({ where: { name: { startsWith: "اخت11_" } } });

    // Step 8: Follow-up
    console.log("  6b: Step 8 regression");
    const PFX8 = "fu_s11_";
    const vReg = await prisma.visitor.create({
      data: { id: `${PFX8}v`, name: "إعادة11_زائر", phone: "0599981110", type: "visitor", lastVisit: new Date(Date.now() - 20 * day) },
    });
    await prisma.session.create({ data: { id: `${PFX8}s`, visitorId: vReg.id, checkIn: new Date(Date.now() - 20 * day), amount: 0, paymentStatus: "paid" } });
    const fuRes = await fetch(`http://localhost:${PORT}/api/v1/follow-up`, { headers: H });
    const fuBody = (await fuRes.json()) as any;
    check("step8: old visitor in follow-up", fuBody.data.some((v: any) => v.id === vReg.id), "found=true");
    const ctRes = await fetch(`http://localhost:${PORT}/api/v1/follow-up/${vReg.id}/contacted`, { method: "POST", headers: H });
    check("step8: contacted ok", ctRes.status === 200, "status=" + ctRes.status);
    await prisma.session.deleteMany({ where: { id: { startsWith: PFX8 } } });
    await prisma.visitor.deleteMany({ where: { id: { startsWith: PFX8 } } });

    // Step 9: Dashboard
    console.log("  6c: Step 9 regression");
    const dashRes = await fetch(`http://localhost:${PORT}/api/v1/dashboard/summary`, { headers: H });
    const dashBody = (await dashRes.json()) as any;
    check("step9: summary 200", dashRes.status === 200, "status=" + dashRes.status);
    check("step9: liveVisitorCount integer", Number.isInteger(dashBody.data.liveVisitorCount), "val=" + dashBody.data.liveVisitorCount);
    check("step9: todayRevenue number", typeof dashBody.data.todayRevenue === "number", "val=" + dashBody.data.todayRevenue);
    const trendRes = await fetch(`http://localhost:${PORT}/api/v1/dashboard/revenue-trend?days=3`, { headers: H });
    check("step9: trend 200", trendRes.status === 200, "status=" + trendRes.status);

    // Step 10: Reports
    console.log("  6d: Step 10 regression");
    const todayStr2 = new Date().toISOString().slice(0, 10);
    const reportRes = await fetch(`http://localhost:${PORT}/api/v1/reports/export?from=${todayStr2}&to=${todayStr2}&format=xlsx`, { headers: H });
    check("step10: export 200", reportRes.status === 200, "status=" + reportRes.status);
    check("step10: content-type xlsx", (reportRes.headers.get("content-type") || "").includes("spreadsheetml.sheet"), "ct=" + reportRes.headers.get("content-type"));

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await reportRes.arrayBuffer()));
    check("step10: 6 sheets", wb.worksheets.length === 6, "count=" + wb.worksheets.length);

    // ================================================================
    // SUMMARY
    // ================================================================
    console.log("\n========================================");
    console.log("RESULTS: " + passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
    console.log("========================================");
    if (failed === 0) console.log("ALL STEP 11 VERIFICATIONS COMPLETED SUCCESSFULLY!");
    else console.log("SOME TESTS FAILED!");

    if (failed > 0) process.exit(1);
  } finally {
    const cleanupIds = (await prisma.staff.findMany({ where: { username: { startsWith: PFX } }, select: { id: true } })).map(s => s.id);
    if (cleanupIds.length > 0) {
      await prisma.permission.deleteMany({ where: { staffId: { in: cleanupIds } } });
      await prisma.staff.deleteMany({ where: { id: { in: cleanupIds } } });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }
}

setTimeout(() => {
  console.error("\nFATAL: Test timed out after 120 seconds - possible deadlock");
  process.exit(2);
}, 120_000).unref();

test().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
