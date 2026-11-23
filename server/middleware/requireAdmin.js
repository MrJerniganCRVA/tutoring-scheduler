const Teacher = require('../models/Teacher');

// Runs after middleware/auth.js. is_admin is read from the database on every
// request rather than trusted from the session, so revoking admin takes effect
// immediately instead of when the session expires.
module.exports = async function requireAdmin(req, res, next) {
  try {
    const teacher = await Teacher.findByPk(req.teacher.id, { attributes: ['id', 'is_admin'] });
    if (!teacher?.is_admin) {
      return res.status(403).json({ msg: 'Admin access required' });
    }
    req.isAdmin = true;
    next();
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
};

// For routes open to every teacher that widen their answer for admins.
module.exports.isAdmin = async function isAdmin(teacherId) {
  const teacher = await Teacher.findByPk(teacherId, { attributes: ['is_admin'] });
  return !!teacher?.is_admin;
};
