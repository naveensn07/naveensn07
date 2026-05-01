const jwt = require("jsonwebtoken");
const prisma = require("../db");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization token missing." });
  }

  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        adminId: true,
        memberId: true,
        adminUserId: true,
        adminUser: {
          select: { id: true, name: true, adminId: true },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid token user." });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function requireSystemAdmin(req, res, next) {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Admin role is required." });
  }
  return next();
}

module.exports = { requireAuth, requireSystemAdmin };
