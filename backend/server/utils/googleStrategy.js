// src/utils/googleStrategy.js
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import { models } from "../db/index.js";
const { User } = models;

// Helpers
const sanitizeUsername = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 50);
};

const normalizeEmail = (email) => {
  return String(email || "")
    .trim()
    .toLowerCase();
};

const generateUniqueUsername = async (baseValue) => {
  let base = sanitizeUsername(baseValue) || `user${Date.now()}`;

  if (base.length < 3) {
    base = `user${base}`;
  }

  base = base.slice(0, 50);

  let candidate = base;
  let counter = 0;

  while (await User.findOne({ where: { username: candidate }, attributes: ["id"] })) {
    counter += 1;

    const suffix = String(counter);
    const maxBaseLength = 50 - suffix.length;

    candidate = `${base.slice(0, Math.max(3, maxBaseLength))}${suffix}`;
  }

  return candidate;
};

// Google Strategy

passport.use(
  new GoogleStrategy(
    { clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, callbackURL: process.env.GOOGLE_CALLBACK_URL },

    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = String(profile?.id || "").trim();

        const email = normalizeEmail(profile?.emails?.[0]?.value);

        const emailVerified = profile?.emails?.[0]?.verified === true || profile?.emails?.[0]?.verified === 'true' || profile?._json?.email_verified === true;

        if (!googleId) {
          return done(new Error("Google account ID is missing"), null);
        }

        if (!email) {
          return done(new Error("Google account email is missing"), null);
        }

        if (!emailVerified) {
          return done(new Error("Google account email is not verified"), null);
        }

        const displayName = profile?.displayName?.trim() || null;

        const avatar = profile?.photos?.[0]?.value || null;

        // Find User By Google ID (we don't have googleId explicitly mapped, but we map by email since we don't have googleId column. Let's use email directly)
        
        // Find User By Email
        let user = await User.findOne({ where: { email } });

        if (user) {
          console.log("[GoogleStrategy] Existing Google user", { userId: user.id });

          const updates = {};

          if (user.authProvider !== 'google') {
            updates.authProvider = 'google';
          }

          if (avatar && user.avatar !== avatar) {
            updates.avatar = avatar;
          }

          if (displayName && !user.displayName) {
            updates.displayName = displayName;
          }

          if (Object.keys(updates).length) {
            await user.update(updates);
          }

          return done(null, user);
        }

        // Create User
        user = await User.create({
          email,
          displayName: displayName || email.split("@")[0],
          avatar,
          authProvider: 'google',
        });

        console.log("[GoogleStrategy] New Google user created", { userId: user.id });

        return done(null, user);
      } catch (error) {
        console.error("[GoogleStrategy] Google authentication failed:", { name: error?.name, message: error?.message });

        return done(error, null);
      }
    }
  )
);
