const { z } = require("zod");

const signupSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  role: z.enum(["ADMIN", "MEMBER"]),
  adminId: z.string().trim().optional(),
});

const loginSchema = z.object({
  userId: z.string().trim().min(4).max(40),
  password: z.string().min(6).max(100),
});

const projectCreateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string().min(1)).optional(),
});

const addProjectMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

const taskCreateSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(600).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  dueDate: z.string().datetime().optional(),
  assigneeId: z.string().min(1).optional(),
});

const taskUpdateSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  description: z.string().max(600).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
});

module.exports = {
  signupSchema,
  loginSchema,
  projectCreateSchema,
  addProjectMemberSchema,
  taskCreateSchema,
  taskUpdateSchema,
};
