import http from "http";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = 5996;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail: string) {
  if (condition) { passed++; console.log("  PASS: " + name + " - " + detail); }
  else { failed++; console.log("  FAIL: " + name + " - " + detail); }
}

async function test() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  const createdCourseIds: string[] = [];
  const createdTraineeIds: string[] = [];

  try {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    const loginData = (await loginRes.json()) as any;
    const token = loginData.accessToken;
    const H = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // Get a valid room
    const roomsRes = await fetch(`${BASE_URL}/rooms`, { headers: H });
    const roomsBody = (await roomsRes.json()) as any;
    const roomId = roomsBody.data[0]?.id;

    // Helper to create a course
    async function makeCourse(name: string, price = 500) {
      const res = await fetch(`${BASE_URL}/courses`, {
        method: "POST", headers: H,
        body: JSON.stringify({
          name, trainer: "مدرب اختبار", startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          sessionsCount: 10, pricePerTrainee: price, maxSeats: 15, roomId,
        }),
      });
      const body = (await res.json()) as any;
      createdCourseIds.push(body.data.id);
      return body.data;
    }

    // Helper to add a trainee
    async function makeTrainee(courseId: string, overrides: any = {}) {
      const res = await fetch(`${BASE_URL}/courses/${courseId}/trainees`, {
        method: "POST", headers: H,
        body: JSON.stringify({ name: "متدرب", phone: "0599900000", amountPaid: 100, paymentStatus: "installment", attendancePercent: 50, ...overrides }),
      });
      const body = (await res.json()) as any;
      createdTraineeIds.push(body.data.id);
      return body.data;
    }

    // ================================================================
    // 1. PATCH /courses/:id
    // ================================================================
    console.log("\n=== 1. PATCH /courses/:id ===\n");
    const course1 = await makeCourse("دورة PATCH اختبار");

    // 1a. Success — partial update
    const r1 = await fetch(`${BASE_URL}/courses/${course1.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ name: "دورة PATCH محدثة", trainer: "مدرب جديد" }),
    });
    const b1 = (await r1.json()) as any;
    check("1a. PATCH returns 200", r1.status === 200, "status=" + r1.status);
    check("1a. name updated", b1.data?.name === "دورة PATCH محدثة", "name=" + b1.data?.name);
    check("1a. trainer updated", b1.data?.trainer === "مدرب جديد", "trainer=" + b1.data?.trainer);
    check("1a. pricePerTrainee unchanged", b1.data?.pricePerTrainee === "500", "ppt=" + b1.data?.pricePerTrainee);

    // 1b. Partial — just pricePerTrainee (decimal rounding)
    const r1b = await fetch(`${BASE_URL}/courses/${course1.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ pricePerTrainee: 750.555 }),
    });
    const b1b = (await r1b.json()) as any;
    check("1b. decimal rounded to 2 places", b1b.data?.pricePerTrainee === "750.56", "ppt=" + b1b.data?.pricePerTrainee);

    // 1c. Patch roomId to valid room
    const room2 = roomsBody.data[1]?.id || roomId;
    const r1c = await fetch(`${BASE_URL}/courses/${course1.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ roomId: room2 }),
    });
    check("1c. valid roomId accepted", r1c.status === 200, "status=" + r1c.status);

    // 1d. Patch roomId to invalid room
    const r1d = await fetch(`${BASE_URL}/courses/${course1.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ roomId: "00000000-0000-0000-0000-000000000000" }),
    });
    check("1d. invalid roomId rejected 400", r1d.status === 400, "status=" + r1d.status);

    // 1e. Patch non-existent course
    const r1e = await fetch(`${BASE_URL}/courses/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ name: "nope" }),
    });
    check("1e. non-existent course returns 404", r1e.status === 404, "status=" + r1e.status);

    // 1f. PATCH with invalid body (empty object = no-op but valid)
    const r1f = await fetch(`${BASE_URL}/courses/${course1.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({}),
    });
    check("1f. empty PATCH returns 200 (no-op)", r1f.status === 200, "status=" + r1f.status);

    // 1g. PATCH with invalid field types
    const r1g = await fetch(`${BASE_URL}/courses/${course1.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ name: 12345 }),
    });
    check("1g. invalid name type rejected", r1g.status === 400, "status=" + r1g.status);

    // ================================================================
    // 2. DELETE /courses/:id
    // ================================================================
    console.log("\n=== 2. DELETE /courses/:id ===\n");

    // 2a. DELETE course with no trainees — should succeed
    const course2a = await makeCourse("دورة للحذف النظيف");
    const r2a = await fetch(`${BASE_URL}/courses/${course2a.id}`, { method: "DELETE", headers: H });
    check("2a. DELETE course with no trainees → 204", r2a.status === 204, "status=" + r2a.status);
    const gone = await prisma.course.findUnique({ where: { id: course2a.id } });
    check("2a. course actually deleted", gone === null, "exists=" + (gone !== null));

    // 2b. DELETE course with trainees — should be blocked
    const course2b = await makeCourse("دورة محمية من الحذف");
    const t2b = await makeTrainee(course2b.id);
    const r2b = await fetch(`${BASE_URL}/courses/${course2b.id}`, { method: "DELETE", headers: H });
    const b2b = (await r2b.json()) as any;
    check("2b. DELETE with trainees returns 409", r2b.status === 409, "status=" + r2b.status);
    check("2b. error message mentions trainee count", b2b.message?.includes("1 enrolled"), "msg=" + b2b.message);

    // 2c. DELETE non-existent course
    const r2c = await fetch(`${BASE_URL}/courses/00000000-0000-0000-0000-000000000000`, { method: "DELETE", headers: H });
    check("2c. DELETE non-existent returns 404", r2c.status === 404, "status=" + r2c.status);

    // ================================================================
    // 3. PATCH /courses/:id/trainees/:traineeId
    // ================================================================
    console.log("\n=== 3. PATCH trainee ===\n");
    const course3 = await makeCourse("دورة تعديل المتدربين", 600);
    const t3 = await makeTrainee(course3.id, { name: "متدرب قبل", phone: "0599911111" });

    // 3a. Success — update name and phone
    const r3a = await fetch(`${BASE_URL}/courses/${course3.id}/trainees/${t3.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ name: "متدرب بعد", phone: "0599922222" }),
    });
    const b3a = (await r3a.json()) as any;
    check("3a. PATCH trainee returns 200", r3a.status === 200, "status=" + r3a.status);
    check("3a. name updated", b3a.data?.name === "متدرب بعد", "name=" + b3a.data?.name);
    check("3a. phone updated", b3a.data?.phone === "0599922222", "phone=" + b3a.data?.phone);
    check("3a. amountPaid unchanged", Number(b3a.data?.amountPaid) === 100, "paid=" + b3a.data?.amountPaid);

    // 3b. Partial update — just paymentStatus
    const r3b = await fetch(`${BASE_URL}/courses/${course3.id}/trainees/${t3.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ paymentStatus: "full" }),
    });
    const b3b = (await r3b.json()) as any;
    check("3b. manual paymentStatus override to full", r3b.status === 200, "status=" + r3b.status);
    check("3b. paymentStatus is 'full'", b3b.data?.paymentStatus === "full", "ps=" + b3b.data?.paymentStatus);

    // 3c. Reject invalid paymentStatus
    const r3c = await fetch(`${BASE_URL}/courses/${course3.id}/trainees/${t3.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ paymentStatus: "invalid" }),
    });
    check("3c. invalid paymentStatus rejected 400", r3c.status === 400, "status=" + r3c.status);

    // 3d. Non-existent trainee
    const r3d = await fetch(`${BASE_URL}/courses/${course3.id}/trainees/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ name: "nope" }),
    });
    check("3d. non-existent trainee returns 404", r3d.status === 404, "status=" + r3d.status);

    // 3e. Trainee from different course
    const course3b = await makeCourse("دورة أخرى للتحقق");
    const t3b = await makeTrainee(course3b.id, { name: "متدرب آخر" });
    const r3e = await fetch(`${BASE_URL}/courses/${course3.id}/trainees/${t3b.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ name: "لا يجب تحديث" }),
    });
    check("3e. wrong courseId → 404", r3e.status === 404, "status=" + r3e.status);

    // 3f. Confirm amountPaid CANNOT be set through PATCH
    const r3f = await fetch(`${BASE_URL}/courses/${course3.id}/trainees/${t3.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ amountPaid: 999 }),
    });
    const b3f = (await r3f.json()) as any;
    check("3f. amountPaid ignored in PATCH (field stripped)", Number(b3f.data?.amountPaid) !== 999, "paid=" + b3f.data?.amountPaid);

    // 3g. Empty body on PATCH (valid, no-op)
    const r3g = await fetch(`${BASE_URL}/courses/${course3.id}/trainees/${t3.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({}),
    });
    check("3g. empty PATCH returns 200", r3g.status === 200, "status=" + r3g.status);

    // ================================================================
    // 4. DELETE /courses/:id/trainees/:traineeId
    // ================================================================
    console.log("\n=== 4. DELETE trainee ===\n");

    // 4a. Success — delete trainee
    const t4a = await makeTrainee(course3.id, { name: "متدرب للحذف" });
    const r4a = await fetch(`${BASE_URL}/courses/${course3.id}/trainees/${t4a.id}`, { method: "DELETE", headers: H });
    check("4a. DELETE trainee → 204", r4a.status === 204, "status=" + r4a.status);
    const t4aGone = await prisma.trainee.findUnique({ where: { id: t4a.id } });
    check("4a. trainee actually deleted", t4aGone === null, "exists=" + (t4aGone !== null));

    // 4b. Non-existent trainee
    const r4b = await fetch(`${BASE_URL}/courses/${course3.id}/trainees/00000000-0000-0000-0000-000000000000`, {
      method: "DELETE", headers: H,
    });
    check("4b. DELETE non-existent trainee → 404", r4b.status === 404, "status=" + r4b.status);

    // 4c. Trainee from different course
    const t4c = await makeTrainee(course3.id, { name: "متدرب من كورس آخر" });
    // Move it to course3b context
    const r4c = await fetch(`${BASE_URL}/courses/${course3b.id}/trainees/${t4c.id}`, {
      method: "DELETE", headers: H,
    });
    check("4c. wrong courseId → 404", r4c.status === 404, "status=" + r4c.status);

    // 4d. Verify course still exists after deleting its trainees
    const course3Still = await prisma.course.findUnique({ where: { id: course3.id } });
    check("4d. course still exists after trainee deletion", course3Still !== null, "exists=" + (course3Still !== null));

    // ================================================================
    // 5. Cross-check: PATCH pricePerTrainee below amountPaid — allowed (auto-full)
    // ================================================================
    console.log("\n=== 5. pricePerTrainee lowering behavior ===\n");
    const course5 = await makeCourse("دورة خفض السعر", 200);
    const t5 = await makeTrainee(course5.id, { amountPaid: 200, paymentStatus: "full" });

    // Lower pricePerTrainee to 150 (below amountPaid 200)
    const r5 = await fetch(`${BASE_URL}/courses/${course5.id}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ pricePerTrainee: 150 }),
    });
    const b5 = (await r5.json()) as any;
    check("5a. can lower pricePerTrainee below amountPaid", r5.status === 200, "status=" + r5.status);
    check("5b. new pricePerTrainee is 150", b5.data?.pricePerTrainee === "150", "ppt=" + b5.data?.pricePerTrainee);

    // Now verify trainee's paymentStatus — should still be "full" (amountPaid 200 >= new price 150)
    const t5After = await prisma.trainee.findUnique({ where: { id: t5.id } });
    check("5c. trainee paymentStatus remains full", t5After?.paymentStatus === "full", "ps=" + t5After?.paymentStatus);

    // ================================================================
    // Summary
    // ================================================================
    console.log("\n========================================");
    console.log("RESULTS: " + passed + " passed, " + failed + " failed, " + (passed + failed) + " total");
    console.log("========================================");
    if (failed > 0) process.exit(1);

  } finally {
    // Cleanup: trainees first (to unblock course deletion), then courses
    if (createdTraineeIds.length > 0) {
      await prisma.trainee.deleteMany({ where: { id: { in: createdTraineeIds } } });
    }
    if (createdCourseIds.length > 0) {
      await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  }
}

setTimeout(() => { console.error("\nFATAL: timeout"); process.exit(2); }, 60_000).unref();
test().catch((e) => { console.error("FAIL:", e); process.exit(1); });
