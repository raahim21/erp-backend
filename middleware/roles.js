const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const lowerRoles = allowedRoles.map((e) => e.toLowerCase()); // fix here
    if (!req.user || !lowerRoles.includes(req.user.role.toLowerCase())) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
};

module.exports = requireRole;
