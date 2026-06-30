import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

const API = 'http://localhost:5000/api/v1';

async function main() {
  // ── Step A: Check if phone numbers already exist ──
  console.log("=== STEP A: Check existing phone numbers ===");
  for (const phone of ['0599222333', '0599444555']) {
    const existing = await p.visitor.findFirst({ where: { phone } });
    console.log(`Phone ${phone}: ${existing ? `EXISTS (name="${existing.name}", type="${existing.type}")` : 'DOES NOT EXIST'}`);
  }

  // ── Step B: Authenticate ──
  console.log("\n=== STEP B: Authenticate ===");
  const authRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password123' }),
  });
  const authBody = await authRes.json();
  if (!authBody.accessToken) {
    console.error("Auth failed:", JSON.stringify(authBody));
    process.exit(1);
  }
  const token = authBody.accessToken;
  console.log("Auth OK, got token");

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // ── Step C: Check in a TRAINEE via API with distinct values ──
  console.log("\n=== STEP C: Check-in TRAINEE via API ===");
  const traineePayload = {
    name: "TraineeTestXYZ",
    phone: "0599222333",
    type: "trainee",
    notes: "NotesValueABC",
    source: "SourceTest123",
  };
  console.log("Sending payload:", JSON.stringify(traineePayload, null, 2));

  const checkinRes = await fetch(`${API}/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(traineePayload),
  });
  const checkinBody = await checkinRes.json();
  console.log("Check-in response status:", checkinRes.status);
  console.log("Check-in response:", JSON.stringify(checkinBody, null, 2));

  if (!checkinBody.data) {
    console.error("Check-in failed!");
    process.exit(1);
  }

  const sessionId = checkinBody.data.id;
  const visitorId = checkinBody.data.visitorId;

  // ── Step D: Query DB directly to see what was stored ──
  console.log("\n=== STEP D: Direct DB query ===");
  const visitor = await p.visitor.findUnique({ where: { id: visitorId } });
  console.log("Visitor in DB:");
  console.log(`  name="${visitor.name}"`);
  console.log(`  phone="${visitor.phone}"`);
  console.log(`  type="${visitor.type}"`);
  console.log(`  source="${visitor.source}"`);

  const session = await p.session.findUnique({ where: { id: sessionId } });
  console.log("Session in DB:");
  console.log(`  notes="${session.notes}"`);
  console.log(`  paymentStatus="${session.paymentStatus}"`);
  console.log(`  amount=${session.amount}`);

  // ── Step E: Fetch the LIVE API response and examine it ──
  console.log("\n=== STEP E: Live sessions API response ===");
  const liveRes = await fetch(`${API}/sessions/live`, { headers });
  const liveBody = await liveRes.json();
  const liveData = liveBody.data;
  const thisSession = liveData?.find((s) => s.id === sessionId);
  if (thisSession) {
    console.log("Live API response for this session:");
    console.log(`  visitor.name="${thisSession.visitor?.name}"`);
    console.log(`  visitor.type="${thisSession.visitor?.type}"`);
    console.log(`  visitor.source="${thisSession.visitor?.source}"`);
    console.log(`  notes="${thisSession.notes}"`);
    console.log(`  amount=${thisSession.amount}`);
  } else {
    console.log("Session NOT found in live list (may have been checked out)");
  }

  // ── Step F: Check ALL live sessions to see the column ordering ──
  console.log("\n=== STEP F: All live sessions (full structure) ===");
  for (const s of liveData) {
    console.log(`Session ${s.id}: visitor.name="${s.visitor?.name}" visitor.type="${s.visitor?.type}" notes="${s.notes}"`);
  }

  // ── Step G: Now check-in a VISITOR with different distinct values ──
  console.log("\n=== STEP G: Check-in VISITOR via API ===");
  const visitorPayload = {
    name: "VisitorTestDEF",
    phone: "0599444555",
    type: "visitor",
    notes: "VisitorNotesGHI",
    source: "VisitorSourceJKL",
  };
  console.log("Sending payload:", JSON.stringify(visitorPayload, null, 2));

  const checkinRes2 = await fetch(`${API}/sessions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(visitorPayload),
  });
  const checkinBody2 = await checkinRes2.json();
  console.log("Check-in response status:", checkinRes2.status);

  if (checkinBody2.data) {
    const visitorId2 = checkinBody2.data.visitorId;
    const visitor2 = await p.visitor.findUnique({ where: { id: visitorId2 } });
    console.log("Visitor in DB:");
    console.log(`  name="${visitor2.name}"`);
    console.log(`  phone="${visitor2.phone}"`);
    console.log(`  type="${visitor2.type}"`);
    console.log(`  source="${visitor2.source}"`);

    const session2 = await p.session.findUnique({ where: { id: checkinBody2.data.id } });
    console.log("Session in DB:");
    console.log(`  notes="${session2.notes}"`);
  }

  // ── Step H: Final live sessions list ──
  console.log("\n=== STEP H: Final live sessions ===");
  const liveRes2 = await fetch(`${API}/sessions/live`, { headers });
  const liveBody2 = await liveRes2.json();
  for (const s of liveBody2.data) {
    console.log(`  visitor.name="${s.visitor?.name}" visitor.type="${s.visitor?.type}" notes="${s.notes}" visitor.source="${s.visitor?.source}"`);
  }

  // ── Cleanup: checkout both sessions so they don't linger ──
  console.log("\n=== CLEANUP: Checking out test sessions ===");
  for (const s of liveBody2.data) {
    if (s.id === sessionId || (checkinBody2.data && s.id === checkinBody2.data.id)) {
      const coRes = await fetch(`${API}/sessions/${s.id}/checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ paymentMethod: 'cash' }),
      });
      console.log(`Checkout ${s.id}: status=${coRes.status}`);
    }
  }
}

main().then(() => p.$disconnect()).catch(e => { console.error(e); p.$disconnect(); process.exit(1); });
