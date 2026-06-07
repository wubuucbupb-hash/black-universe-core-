import express from "express";
import cors from "cors";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcrypt";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// Express v5 safe options route configuration
app.options("/api/users/register", (req, res) => {
  res.sendStatus(200);
});
app.options("/api/users/reset-password", (req, res) => {
  res.sendStatus(200);
});

app.post("/api/users/register", async (req, res): Promise<void> => {
  console.log("--- Registration Request Hit ---");
  try {
    const { name, email, phoneNumber, password } = req.body;

    if (!name || !email || !phoneNumber || !password) {
      res.status(400).json({ error: "All fields are required" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await db
      .insert(usersTable)
      .values({
        name,
        email,
        phoneNumber,
        passwordHash: hashedPassword,
        role: "citizen",
      })
      .returning();

    console.log("User Registered Successfully!");
    res
      .status(201)
      .json({ message: "User registered successfully", user: newUser[0] });
  } catch (error: any) {
    console.error("Backend Registration Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/users/reset-password", async (req, res): Promise<void> => {
  console.log("--- Reset Password Request Hit ---");
  try {
    const { email, password } = req.body;

    if (!email) {
      res.status(400).json({ error: "Email or Phone Number is required" });
      return;
    }

    const users = await db
      .select()
      .from(usersTable)
      .where(
        or(eq(usersTable.email, email), eq(usersTable.phoneNumber, email)),
      );

    if (users.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const targetUser = users[0];

    await db
      .update(usersTable)
      .set({ passwordHash: hashedPassword })
      .where(eq(usersTable.id, targetUser.id));

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error: any) {
    console.error("Backend DB Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("Backend Server Running Perfectly!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening port: ${PORT}`);
});
