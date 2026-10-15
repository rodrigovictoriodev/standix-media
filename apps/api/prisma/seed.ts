import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const permissionDescriptions: Record<string, string> = {
  "users:manage": "Manage users and invitations",
  "roles:manage": "Manage roles and permissions",
  "teams:manage": "Manage teams and membership",
  "audit:read": "Read audit history",
  "assets:read": "Read media assets",
  "assets:create": "Upload media assets",
  "assets:update": "Edit media assets",
  "assets:delete": "Delete media assets",
  "events:read": "Read events",
  "events:create": "Create events",
  "events:update": "Edit events",
  "events:delete": "Delete events",
  "presentations:read": "Read presentations and slides",
  "presentations:create": "Create presentations and slides",
  "presentations:update": "Edit presentations and slides",
  "presentations:delete": "Delete presentations and slides",
  "presentations:operate": "Operate presentations",
  "screens:read": "Read screen configuration",
  "screens:manage": "Configure screens",
  "screens:operate": "Control screen output",
  "audio:read": "Read audio cues",
  "audio:operate": "Operate audio cues",
  "sampler:read": "Read sampler configuration",
  "sampler:operate": "Operate sampler",
  "videos:read": "Read video cues",
  "videos:operate": "Operate video cues",
};

const rolePermissions: Record<string, string[]> = {
  Admin: Object.keys(permissionDescriptions),
  Editor: [
    "assets:read",
    "assets:create",
    "assets:update",
    "events:read",
    "events:create",
    "events:update",
    "presentations:read",
    "presentations:create",
    "presentations:update",
    "screens:read",
    "audio:read",
    "sampler:read",
    "videos:read",
  ],
  Operator: [
    "events:read",
    "presentations:read",
    "presentations:operate",
    "screens:read",
    "screens:operate",
    "videos:read",
    "videos:operate",
  ],
  AudioOperator: [
    "events:read",
    "assets:read",
    "audio:read",
    "audio:operate",
    "sampler:read",
    "sampler:operate",
  ],
  Viewer: [
    "assets:read",
    "events:read",
    "presentations:read",
    "screens:read",
    "audio:read",
    "sampler:read",
    "videos:read",
  ],
};

async function seed() {
  const permissions = await Promise.all(
    Object.entries(permissionDescriptions).map(([key, description]) =>
      prisma.permission.upsert({
        where: { key },
        update: { description },
        create: { key, description },
      }),
    ),
  );
  const permissionIds = new Map(permissions.map(({ key, id }) => [key, id]));

  for (const [name, keys] of Object.entries(rolePermissions)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description: `${name} access role` },
      create: { name, description: `${name} access role`, isSystem: true },
    });
    for (const key of keys) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permissionIds.get(key)!,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permissionIds.get(key)! },
      });
    }
  }

  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (email || password) {
    if (!email || !password || password.length < 12) {
      throw new Error(
        "Set both BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 12 characters",
      );
    }
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: "Standix Admin",
          passwordHash: await argon2.hash(password),
        },
      });
    }
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: "Admin" },
    });
    const assignment = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: adminRole.id, teamId: null },
      select: { id: true },
    });
    if (!assignment) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: adminRole.id },
      });
    }
  }
}

seed()
  .catch((error: unknown) => {
    console.error("Prisma seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
