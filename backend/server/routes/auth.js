// backend/server/routes/auth.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import passport from "passport";
import { models } from "../db/index.js";

const { User } = models;
const router = Router();

// Helper to generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      userId: user.id,
      email: user.email, 
      role: "player",
      type: "access"
    }, 
    process.env.JWT_KEY || "default_secret", 
    { expiresIn: "7d" }
  );
};

// 1. Guest Login / Registration
router.post("/guest", async (req, res) => {
  try {
    const rawName = String(req.body?.displayName || "Guest").trim();
    const displayName = rawName.slice(0, 30) || "Guest";
    const guestEmail = `guest_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}@mafia.local`;

    const user = await User.create({
      displayName,
      email: guestEmail,
      authProvider: "local",
      isOnline: true
    });

    const token = generateToken(user);
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email
      }
    });
  } catch (error) {
    console.error("Guest login error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Google OAuth Initialization
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

// 3. Google OAuth Callback
router.get("/google/callback", passport.authenticate("google", { session: false }), (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Google Authentication Failed" });
  }

  const token = generateToken(req.user);
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  res.redirect(`${frontendUrl}?token=${token}`);
});

export default router;
