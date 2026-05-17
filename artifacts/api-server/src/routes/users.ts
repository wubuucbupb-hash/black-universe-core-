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

// 1. रजिस्ट्रेशन रूट (New Updated Logic)
router.post("/users/register", async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const { name, email, password, role, subCategory, documentUrl, phoneNumber } = req.body;

    // चेक करें कि ईमेल पहले से मौजूद तो नहीं है
    const existingUser = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existingUser.length > 0) {
      res.status(400).json({ error: "Email already registered" });
      return;
    }

    // चेक करें कि फोन नंबर पहले से मौजूद तो नहीं है
    if (phoneNumber) {
      const existingPhone = await db.select().from(usersTable).where(eq(usersTable.phoneNumber, phoneNumber));
      if (existingPhone.length > 0) {
        res.status(400).json({ error: "Phone number already registered" });
        return;
      }
    }

    // रोल के हिसाब से ऑटोमैटिक यूनिक अकाउंट नंबर (9000..., 5000...) जनरेट करना
    let prefix = "0000";
    if (role === "9000") prefix = "9000";
    else if (role === "5000") prefix = "5000";
    else if (role === "1000") prefix = "1000";

    const randomDigits = Math.floor(100000 + Math.random() * 900000).toString();
    const generatedAccountNumber = prefix + randomDigits;

    const passwordHash = await bcrypt.hash(password, 10);

    // डेटाबेस में सेव करना
    const [newUser] = await db.insert(usersTable).values({
      name,
      email,
      passwordHash,
      role: role || "0000",
      subCategory: subCategory || null,
      documentUrl: documentUrl || null,
      phoneNumber: phoneNumber || null,
      accountNumber: generatedAccountNumber,
      biometricKey: null
    }).returning();

    res.status(201).json({
      message: "Registration successful",
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        accountNumber: newUser.accountNumber,
        phoneNumber: newUser.phoneNumber
      }
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

// 2. लॉगिन रूट (Email, Phone, या Account Number तीनों से लॉगिन सपोर्ट)
router.post("/users/login", async (req, res): Promise<void> => {
  try {
    const { loginId, password } = req.body; // loginId में यूजर कुछ भी डाल सकता है

    if (!loginId || !password) {
      res.status(400).json({ error: "Login ID and password are required" });
      return;
    }

    // डेटाबेस में ढूंढना (चाहे ईमेल हो, फोन नंबर हो, या अकाउंट नंबर)
    let userFound = null;
    
    const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, loginId));
    if (byEmail.length > 0) userFound = byEmail[0];

    if (!userFound) {
      const byPhone = await db.select().from(usersTable).where(eq(usersTable.phoneNumber, loginId));
      if (byPhone.length > 0) userFound = byPhone[0];
    }

    if (!userFound) {
      const byAccount = await db.select().from(usersTable).where(eq(usersTable.accountNumber, loginId));
      if (byAccount.length > 0) userFound = byAccount[0];
    }

    if (!userFound) {
      res.status(401).json({ error: "Invalid Credentials" });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, userFound.passwordHash);
    if (!passwordMatch) {
      res.status(401).json({ error: "Invalid Credentials" });
      return;
    }

    res.json({
      message: "Login successful",
      user: {
        id: userFound.id,
        name: userFound.name,
        email: userFound.email,
        role: userFound.role,
        accountNumber: userFound.accountNumber
      }
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

export default router;
