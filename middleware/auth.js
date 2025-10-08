const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  const token = req.cookies.token;
  console.log("Auth middleware: Token received:", !!token);
  if (!token) {
    console.log("Auth middleware: No token, authorization denied");
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Auth middleware: Token valid, user ID:", decoded.id);

    req.user = { id: decoded.id, role: decoded.role };

    next();
  } catch (error) {
    console.log("Auth middleware: Token invalid:", error.message);
    res.status(401).json({ message: "Token is not valid" });
  }
};

module.exports = auth;
