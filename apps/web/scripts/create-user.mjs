// Admin account creation (§13.10) — there is no public signup.
// Usage:  npm run user:create -w @proposal/web -- <email> <password>
// Requires DATABASE_URL (loaded from .env.local if present). Passwords are
// scrypt-hashed with the SAME format as src/server/auth/password.ts.
import { neon } from "@neondatabase/serverless";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

const args = process.argv.slice(2);
const isAdmin = args.includes("--admin");
const [email, password] = args.filter((a) => a !== "--admin");
if (!email || !password) {
  console.error("Usage: npm run user:create -w @proposal/web -- [--admin] <email> <password>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to apps/web/.env.local (Neon/Vercel Postgres).");
  process.exit(1);
}

const id = `user_${randomUUID().slice(0, 8)}`;
const normalized = email.trim().toLowerCase();

try {
  const sql = neon(url);
  await sql`INSERT INTO users (id, email, password_hash, is_admin) VALUES (${id}, ${normalized}, ${hashPassword(password)}, ${isAdmin})`;
  console.log(`✓ Created ${isAdmin ? "admin " : ""}account ${normalized} (${id})`);
} catch (err) {
  const message = String(err?.message ?? err);
  if (err?.code === "23505" || message.includes("duplicate key")) {
    console.error(`An account with email ${normalized} already exists.`);
  } else {
    console.error("Failed to create account:", message);
  }
  process.exit(1);
}
