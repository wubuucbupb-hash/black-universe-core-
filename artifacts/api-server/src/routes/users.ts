import { Router } from "express";
import bcrypt from "bcrypt";
import { timingSafeEqual } from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  RegisterUserBody,
  LoginUserBody,
} from "@workspace/api-zod";

const router = Router();

/**
 * Constant-time string comparison so timing attacks cannot reveal
 * whether the admin email/password env vars are set.
 */
function safeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

router.post("/users/register", async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // फ्रंटएंड से रोल, सब-कैटेगरी और डॉक्यूमेंट यूआरएल आ रहे हैं
  const { name, email, password, role, subCategory, documentUrl } = req.body;

  // चेकपोस्ट: एडमिन को छोड़कर बाकी सबके लिए डॉक्यूमेंट जरूरी है
  if (role !== 'admin' && !documentUrl) {
    res.status(400).json({ error: "सिस्टम एंट्री के लिए डाक्यूमेंट्स अपलोड करना अनिवार्य है।" });
    return;
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  // ⚙️ कस्टमाइज्ड अकाउंट नंबर जनरेटर लॉजिक
  let prefix = '9000'; // डिफ़ॉल्ट नागरिक
  if (role === 'admin') {
    prefix = '0000'; // मास्टर फाउंडर सीरीज
  } else if (role === 'sovereign') {
    prefix = subCategory === '1000' ? '1000' : subCategory === '2000' ? '2000' : '0000';
  } else if (role === 'corporate') {
    prefix = subCategory === '3000' ? '3000' : '5000';
  }

  // इस स्पेसिफिक प्रीफिक्स का आखिरी यूजर ढूंढें
  const lastUsers = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, role))
    .orderBy(desc(usersTable.id))
    .limit(1);

  let nextSerial = 1;
  if (lastUsers.length > 0 && lastUsers[0].accountNumber) {
    const lastSerialStr = lastUsers[0].accountNumber.slice(4);
    nextSerial = parseInt(lastSerialStr, 10) + 1;
  }
  const paddedSerial = String(nextSerial).padStart(8, '0');
  const customAccountNumber = role === 'admin' ? '000000000000' : `${prefix}${paddedSerial}`;

  const passwordHash = await bcrypt.hash(password, 10);
  
  // डेटाबेस में नई फील्ड्स के साथ डेटा सेव करें
  const [user] = await db
    .insert(usersTable)
    .values({ 
      name, 
      email, 
      passwordHash, 
      role: role || "user",
      accountNumber: customAccountNumber,
      verificationDocument: documentUrl || null,
      status: 'pending' // आपकी मंजूरी का इंतजार रहेगा
    })
    .returning();

  req.session.userId = user.id;

  res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    accountNumber: user.accountNumber,
    createdAt: user.createdAt,
  });
});


router.post("/users/login", async (req, res): Promise<void> => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  // ── Admin fast-path ───────────────────────────────────────────────────────
  // If the submitted email matches ADMIN_EMAIL, validate directly against the
  // ADMIN_PASSWORD secret — no bcrypt hash in the DB is required. This works
  // even before ensureAdmin() has had a chance to write a DB record.
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPassword && safeEqual(email, adminEmail)) {
    if (!safeEqual(password, adminPassword)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Find or create the admin DB record so we have a real user id for the session
    let [adminUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .limit(1);

    if (!adminUser) {
      const hash = await bcrypt.hash(adminPassword, 12);
      [adminUser] = await db
        .insert(usersTable)
        .values({ name: "Black Universe Admin", email: adminEmail, passwordHash: hash, role: "admin" })
        .returning();
    } else if (!safeEqual(adminUser.email, adminEmail)) {
      // Keep DB record in sync with the env var
      await db
        .update(usersTable)
        .set({ email: adminEmail })
        .where(eq(usersTable.id, adminUser.id));
      adminUser.email = adminEmail;
    }

    req.session.userId = adminUser.id;
    res.json({
      user: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role,
        createdAt: adminUser.createdAt,
      },
    });
    return;
  }
  // ── End admin fast-path ───────────────────────────────────────────────────

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = user.id;

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

router.get("/users/me", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  });
});

router.post("/users/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

export default router;
