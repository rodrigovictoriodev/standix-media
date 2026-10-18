import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { MIN_PASSWORD_LENGTH } from "../auth/auth.constants";

/** Usage: `node dist/scripts/reset-password.js <email> <new-password>` (see `npm run admin:reset-password`). */
async function main() {
  const [rawEmail, newPassword] = process.argv.slice(2);
  if (!rawEmail || !newPassword) {
    throw new Error("Usage: admin:reset-password -- <email> <new-password>");
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `The password must have at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const email = rawEmail.trim().toLowerCase();
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) throw new Error(`User not found: ${email}`);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(newPassword) },
    });
    console.log(`Password updated for ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
