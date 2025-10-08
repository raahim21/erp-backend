const Log = require("../models/Log");

const logAction = async (userId, action, details = "") => {
  try {
    await Log.create({ userId, action, details });
  } catch (err) {
    console.error("Logging failed:", err.message);
  }
};

module.exports = logAction;
