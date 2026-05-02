require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("./db");
const { requireAuth, requireSystemAdmin } = require("./middleware/auth");
const {
  signupSchema,
  loginSchema,
  projectCreateSchema,
  addProjectMemberSchema,
  taskCreateSchema,
  taskUpdateSchema,
} = require("./validation");

const app = express();
const PORT = process.env.PORT || 3000;
const REQUIRED_ENV_VARS = ["DATABASE_URL", "JWT_SECRET"];

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/assets/pic1.jpg", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "pic1.jpg"));
});
app.get("/assets/pic2.jpg", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "pic2.jpg"));
});

function issueToken(user) {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function buildIdentityCode(prefix) {
  const stamp = Date.now().toString().slice(-6);
  const random = Math.floor(100 + Math.random() * 900);
  return `${prefix}${stamp}${random}`;
}

async function generateUniqueCode(prefix, field) {
  let code = buildIdentityCode(prefix);
  let existing = await prisma.user.findUnique({ where: { [field]: code } });
  while (existing) {
    code = buildIdentityCode(prefix);
    existing = await prisma.user.findUnique({ where: { [field]: code } });
  }
  return code;
}

async function getMembership(projectId, userId) {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

function loginRateLimiter(req, res, next) {
  const key = `${req.ip}:${String(req.body?.userId || "").trim().toLowerCase()}`;
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current || now > current.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return next();
  }

  if (current.count >= LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ message: "Too many login attempts. Please try again later." });
  }

  current.count += 1;
  return next();
}

app.post("/api/auth/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Validation error", errors: parsed.error.issues });
  }

  try {
    const { name, email, password, role, adminId } = parsed.data;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "Email already in use." });
    }

    let adminUser = null;
    if (role === "MEMBER") {
      if (!adminId) {
        return res.status(400).json({ message: "Admin ID is required for member signup." });
      }
      adminUser = await prisma.user.findUnique({ where: { adminId } });
      if (!adminUser || adminUser.role !== "ADMIN") {
        return res.status(400).json({ message: "Valid Admin ID is required." });
      }
    }

    const generatedAdminId = role === "ADMIN" ? await generateUniqueCode("ADM", "adminId") : null;
    const generatedMemberId = role === "MEMBER" ? await generateUniqueCode("MEM", "memberId") : null;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        adminId: generatedAdminId,
        memberId: generatedMemberId,
        adminUserId: adminUser?.id || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        adminId: true,
        memberId: true,
        adminUser: {
          select: { id: true, name: true, adminId: true },
        },
      },
    });

    if (role === "MEMBER" && adminUser) {
      const adminProjectMemberships = await prisma.projectMember.findMany({
        where: { userId: adminUser.id },
        select: { projectId: true },
      });
      if (adminProjectMemberships.length > 0) {
        await prisma.projectMember.createMany({
          data: adminProjectMemberships.map(({ projectId }) => ({
            projectId,
            userId: user.id,
            role: "MEMBER",
          })),
          skipDuplicates: true,
        });
      }
    }

    const token = issueToken(user);
    return res.status(201).json({ user, token });
  } catch (error) {
    return res.status(500).json({ message: "Failed to signup." });
  }
});

app.post("/api/auth/login", loginRateLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Validation error", errors: parsed.error.issues });
  }

  try {
    const { userId, password } = parsed.data;
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ adminId: userId }, { memberId: userId }],
      },
    });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const payloadUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      adminId: user.adminId,
      memberId: user.memberId,
      adminUserId: user.adminUserId,
    };
    const token = issueToken(payloadUser);
    return res.json({ user: payloadUser, token });
  } catch (error) {
    return res.status(500).json({ message: "Login failed." });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  return res.json({ user: req.user });
});

app.get("/api/users", requireAuth, requireSystemAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      adminId: true,
      memberId: true,
      adminUser: { select: { id: true, name: true, adminId: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ users });
});

app.post("/api/projects", requireAuth, async (req, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Only admins can create projects." });
  }

  const parsed = projectCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Validation error", errors: parsed.error.issues });
  }

  try {
    const { name, description, memberIds = [] } = parsed.data;
    const managedMembers = await prisma.user.findMany({
      where: { adminUserId: req.user.id, role: "MEMBER" },
      select: { id: true },
    });
    const autoMemberIds = managedMembers.map((member) => member.id);
    const uniqueMemberIds = [...new Set([req.user.id, ...autoMemberIds, ...memberIds])];
    const project = await prisma.project.create({
      data: {
        name,
        description,
        members: {
          create: uniqueMemberIds.map((userId) => ({
            userId,
            role: userId === req.user.id ? "ADMIN" : "MEMBER",
          })),
        },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
      },
    });
    return res.status(201).json({ project });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create project." });
  }
});

app.get("/api/projects", requireAuth, async (req, res) => {
  const memberships = await prisma.projectMember.findMany({
    where: { userId: req.user.id },
    include: {
      project: {
        include: {
          _count: { select: { tasks: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const projects = memberships.map((m) => ({ ...m.project, membershipRole: m.role }));
  return res.json({ projects });
});

app.post("/api/projects/:projectId/members", requireAuth, async (req, res) => {
  const parsed = addProjectMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Validation error", errors: parsed.error.issues });
  }

  const { projectId } = req.params;
  const adminMembership = await getMembership(projectId, req.user.id);
  if (!adminMembership || adminMembership.role !== "ADMIN") {
    return res.status(403).json({ message: "Project admin role required." });
  }

  try {
    const member = await prisma.projectMember.create({
      data: { projectId, userId: parsed.data.userId, role: parsed.data.role },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    return res.status(201).json({ member });
  } catch (error) {
    return res.status(400).json({ message: "Member could not be added." });
  }
});

app.get("/api/projects/:projectId/tasks", requireAuth, async (req, res) => {
  const { projectId } = req.params;
  const membership = await getMembership(projectId, req.user.id);
  if (!membership) {
    return res.status(403).json({ message: "Not part of this project." });
  }

  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  return res.json({ tasks });
});

app.post("/api/projects/:projectId/tasks", requireAuth, async (req, res) => {
  const parsed = taskCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Validation error", errors: parsed.error.issues });
  }

  const { projectId } = req.params;
  const membership = await getMembership(projectId, req.user.id);
  if (!membership) {
    return res.status(403).json({ message: "Not part of this project." });
  }
  if (parsed.data.assigneeId) {
    const assigneeMembership = await getMembership(projectId, parsed.data.assigneeId);
    if (!assigneeMembership) {
      return res.status(400).json({ message: "Assignee must be a member of this project." });
    }
  }

  try {
    const task = await prisma.task.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        status: parsed.data.status,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        assigneeId: parsed.data.assigneeId || null,
        creatorId: req.user.id,
        projectId,
      },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
    });
    return res.status(201).json({ task });
  } catch (error) {
    return res.status(400).json({ message: "Task could not be created." });
  }
});

app.patch("/api/tasks/:taskId", requireAuth, async (req, res) => {
  const parsed = taskUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Validation error", errors: parsed.error.issues });
  }

  const { taskId } = req.params;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    return res.status(404).json({ message: "Task not found." });
  }

  const membership = await getMembership(task.projectId, req.user.id);
  if (!membership) {
    return res.status(403).json({ message: "Not part of this project." });
  }
  const isTaskOwner = task.assigneeId === req.user.id || task.creatorId === req.user.id;
  if (membership.role !== "ADMIN" && !isTaskOwner) {
    const updatedFields = Object.entries(parsed.data)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    const onlyStatusUpdate = updatedFields.length === 1 && updatedFields[0] === "status";
    if (!onlyStatusUpdate) {
      return res.status(403).json({ message: "No permission to edit this task." });
    }
  }

  const data = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.dueDate !== undefined) {
    data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  }
  if (parsed.data.assigneeId !== undefined) {
    if (parsed.data.assigneeId) {
      const assigneeMembership = await getMembership(task.projectId, parsed.data.assigneeId);
      if (!assigneeMembership) {
        return res.status(400).json({ message: "Assignee must be a member of this project." });
      }
    }
    data.assigneeId = parsed.data.assigneeId;
  }

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data,
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
  });
  return res.json({ task: updatedTask });
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const now = new Date();
  const projectMemberships = await prisma.projectMember.findMany({
    where: { userId: req.user.id },
    select: { projectId: true },
  });
  const projectIds = projectMemberships.map((membership) => membership.projectId);

  if (projectIds.length === 0) {
    return res.json({
      stats: {
        total: 0,
        todo: 0,
        inProgress: 0,
        done: 0,
        overdue: 0,
      },
      tasks: [],
    });
  }

  const tasks = await prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
    },
    include: { project: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });

  const stats = {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === "TODO").length,
    inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    done: tasks.filter((t) => t.status === "DONE").length,
    overdue: tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== "DONE").length,
  };

  return res.json({ stats, tasks });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
