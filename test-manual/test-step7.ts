import http from "http";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = 5998;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

let createdRoomId: string;
let createdCourseId: string;
let createdTraineeId: string;

async function test() {
  console.log("==================================================");
  console.log("RUNNING MODULE 7 (ROOMS, BOOKINGS, COURSES, TRAINEES) TESTS");
  console.log("==================================================");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`Test server booted on port ${PORT}\n`);

  try {
    // Clean up any prior test data
    await prisma.trainee.deleteMany({ where: { name: { startsWith: "اختبار_" } } });
    await prisma.course.deleteMany({ where: { name: { startsWith: "اختبار_" } } });
    await prisma.booking.deleteMany({ where: { bookerName: { startsWith: "اختبار_" } } });
    await prisma.room.deleteMany({ where: { name: { startsWith: "اختبار_" } } });

    // Login as admin to get token
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "password123" }),
    });
    const loginData = (await loginRes.json()) as any;
    const token = loginData.accessToken;

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // ----------------------------------------------------
    // Test 1: Create a Room
    // ----------------------------------------------------
    console.log("1. CREATING A ROOM");
    console.log("--------------------------------------------------");
    const roomRes = await fetch(`${BASE_URL}/rooms`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: "اختبار قاعة اختبار 1" }),
    });
    const roomBody = (await roomRes.json()) as any;
    console.log("Room creation status:", roomRes.status);
    console.log("Room response:", JSON.stringify(roomBody, null, 2));
    if (roomRes.status !== 201) throw new Error("Failed to create room");
    createdRoomId = roomBody.data.id;
    console.log("✓ Room created successfully.\n");

    // ----------------------------------------------------
    // Test 2: Create a confirmed booking on the room (14:00-16:00)
    // ----------------------------------------------------
    console.log("2. CREATING A CONFIRMED BOOKING (14:00-16:00)");
    console.log("--------------------------------------------------");
    const start1 = new Date();
    start1.setHours(14, 0, 0, 0);
    const end1 = new Date(start1);
    end1.setHours(16, 0, 0, 0);

    const booking1Res = await fetch(`${BASE_URL}/rooms/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        roomId: createdRoomId,
        bookerName: "اختبار أحمد محاضر",
        bookerPhone: "0599100001",
        purpose: "اجتماع اختبار",
        startTime: start1.toISOString(),
        endTime: end1.toISOString(),
        price: 100.0,
        status: "confirmed",
      }),
    });
    const booking1Body = (await booking1Res.json()) as any;
    console.log("Booking 1 creation status:", booking1Res.status);
    console.log("Booking 1 response:", JSON.stringify(booking1Body, null, 2));
    if (booking1Res.status !== 201) throw new Error("Failed to create booking 1");
    console.log("✓ Booking 1 created successfully.\n");

    // ----------------------------------------------------
    // Test 3: Attempt OVERLAPPING booking (15:00-17:00) — expect 409
    // ----------------------------------------------------
    console.log("3. CREATING OVERLAPPING BOOKING (15:00-17:00) — EXPECT 409");
    console.log("--------------------------------------------------");
    const start2 = new Date(start1);
    start2.setHours(15, 0, 0, 0);
    const end2 = new Date(start1);
    end2.setHours(17, 0, 0, 0);

    const conflictRes = await fetch(`${BASE_URL}/rooms/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        roomId: createdRoomId,
        bookerName: "اختبار بوب تداخل",
        bookerPhone: "0599200002",
        purpose: "اختبار تداخل",
        startTime: start2.toISOString(),
        endTime: end2.toISOString(),
        price: 120.0,
        status: "confirmed",
      }),
    });
    const conflictBody = await conflictRes.json();
    console.log("Overlapping booking HTTP status:", conflictRes.status);
    console.log("Response body:", JSON.stringify(conflictBody, null, 2));
    if (conflictRes.status !== 409) {
      throw new Error(`Expected 409 for overlapping booking, got ${conflictRes.status}`);
    }
    console.log("✓ Overlapping booking correctly rejected with 409.\n");

    // ----------------------------------------------------
    // Test 4: Create NON-overlapping booking (16:30-18:00) — expect 201
    // ----------------------------------------------------
    console.log("4. CREATING NON-OVERLAPPING BOOKING (16:30-18:00) — EXPECT 201");
    console.log("--------------------------------------------------");
    const start3 = new Date(start1);
    start3.setHours(16, 30, 0, 0);
    const end3 = new Date(start1);
    end3.setHours(18, 0, 0, 0);

    const booking3Res = await fetch(`${BASE_URL}/rooms/bookings`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        roomId: createdRoomId,
        bookerName: "اختبار شارل لا تداخل",
        bookerPhone: "0599300003",
        purpose: "اختبار لا تداخل",
        startTime: start3.toISOString(),
        endTime: end3.toISOString(),
        price: 150.0,
        status: "confirmed",
      }),
    });
    const booking3Body = (await booking3Res.json()) as any;
    console.log("Non-overlapping booking HTTP status:", booking3Res.status);
    console.log("Booking 3 response:", JSON.stringify(booking3Body, null, 2));
    if (booking3Res.status !== 201) {
      throw new Error(`Expected 201 for non-overlapping booking, got ${booking3Res.status}`);
    }
    console.log("✓ Non-overlapping booking created successfully with 201.\n");

    // ----------------------------------------------------
    // Test 5: Create Course linked to the Room
    // ----------------------------------------------------
    console.log("5. CREATING A COURSE LINKED TO THE ROOM");
    console.log("--------------------------------------------------");
    const courseRes = await fetch(`${BASE_URL}/courses`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "اختبار دورة اختبار",
        trainer: "المدرب اختبار",
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        sessionsCount: 5,
        pricePerTrainee: 350.777,
        maxSeats: 20,
        roomId: createdRoomId,
      }),
    });
    const courseBody = (await courseRes.json()) as any;
    console.log("Course creation status:", courseRes.status);
    console.log("Course response:", JSON.stringify(courseBody, null, 2));
    if (courseRes.status !== 201) throw new Error("Failed to create course");
    createdCourseId = courseBody.data.id;

    // Verify rounding: 350.777 → 350.78
    if (Number(courseBody.data.pricePerTrainee) !== 350.78) {
      throw new Error(`Expected pricePerTrainee to be 350.78, got ${courseBody.data.pricePerTrainee}`);
    }
    console.log("✓ Course created and pricePerTrainee rounded to 350.78.\n");

    // ----------------------------------------------------
    // Test 6: Add a Trainee to the Course
    // ----------------------------------------------------
    console.log("6. ADDING A TRAINEE TO THE COURSE");
    console.log("--------------------------------------------------");
    const traineeRes = await fetch(`${BASE_URL}/courses/${createdCourseId}/trainees`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        name: "اختبار متدرب أول",
        phone: "0599400004",
        amountPaid: 350.777,
        paymentStatus: "full",
        attendancePercent: 0,
      }),
    });
    const traineeBody = (await traineeRes.json()) as any;
    console.log("Trainee add status:", traineeRes.status);
    console.log("Trainee response:", JSON.stringify(traineeBody, null, 2));
    if (traineeRes.status !== 201) throw new Error("Failed to add trainee");
    createdTraineeId = traineeBody.data.id;

    // Verify rounding: 350.777 → 350.78
    if (Number(traineeBody.data.amountPaid) !== 350.78) {
      throw new Error(`Expected amountPaid to be 350.78, got ${traineeBody.data.amountPaid}`);
    }
    console.log("✓ Trainee added and amountPaid rounded to 350.78.\n");

    // ----------------------------------------------------
    // Test 7: Update Trainee Attendance
    // ----------------------------------------------------
    console.log("7. UPDATING TRAINEE ATTENDANCE");
    console.log("--------------------------------------------------");
    const attendRes = await fetch(`${BASE_URL}/courses/${createdCourseId}/trainees/${createdTraineeId}/attendance`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ attendancePercent: 85.5 }),
    });
    const attendBody = (await attendRes.json()) as any;
    console.log("Attendance update status:", attendRes.status);
    console.log("Trainee after update:", JSON.stringify(attendBody, null, 2));
    if (attendRes.status !== 200) throw new Error("Failed to update attendance");
    if (attendBody.data.attendancePercent !== 85.5) {
      throw new Error(`Expected attendancePercent 85.5, got ${attendBody.data.attendancePercent}`);
    }

    // Verify in database
    const traineeInDb = await prisma.trainee.findUnique({ where: { id: createdTraineeId } });
    console.log("Database verified attendancePercent:", traineeInDb?.attendancePercent);
    if (traineeInDb?.attendancePercent !== 85.5) {
      throw new Error("Database verification failed for attendance update");
    }
    console.log("✓ Attendance updated and verified in database.\n");

    // ----------------------------------------------------
    // Test 8: Authorization Block — Noor (staff) has NO edit perms on "القاعات"
    // ----------------------------------------------------
    console.log("8. AUTHORIZATION BLOCK — NOOR CANNOT EDIT ROOMS (EXPECTED 403)");
    console.log("--------------------------------------------------");
    const noorLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "noor", password: "password123" }),
    });
    const noorLoginBody = (await noorLoginRes.json()) as any;
    const noorToken = noorLoginBody.accessToken;

    // Noor tries to create a room — should be 403 (no edit perms on "القاعات")
    const noorCreateRes = await fetch(`${BASE_URL}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${noorToken}` },
      body: JSON.stringify({ name: "اختبار دورقاعة نور" }),
    });
    console.log("Noor POST /rooms status (expected 403):", noorCreateRes.status);
    const noorCreateBody = await noorCreateRes.json();
    console.log("Response body:", JSON.stringify(noorCreateBody, null, 2));
    if (noorCreateRes.status !== 403) {
      throw new Error(`Expected 403 for Noor, got ${noorCreateRes.status}`);
    }
    console.log("✓ Noor correctly blocked from creating rooms.\n");

    // ----------------------------------------------------
    // Cleanup test data
    // ----------------------------------------------------
    console.log("CLEANING UP TEST DATA...");
    await prisma.trainee.deleteMany({ where: { name: { startsWith: "اختبار_" } } });
    await prisma.course.deleteMany({ where: { name: { startsWith: "اختبار_" } } });
    await prisma.booking.deleteMany({ where: { bookerName: { startsWith: "اختبار_" } } });
    await prisma.room.deleteMany({ where: { name: { startsWith: "اختبار_" } } });
    console.log("✓ Test data cleaned up.\n");

    console.log("==================================================");
    console.log("ALL STEP 7 VERIFICATIONS COMPLETED SUCCESSFULLY!");
    console.log("==================================================");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve));
    await prisma.$disconnect();
    console.log("Test server stopped and database disconnected.");
  }
}

test().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
