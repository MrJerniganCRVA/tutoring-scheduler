const Teacher = require('../models/Teacher');

const DEV_AUTH_BYPASS = process.env.DEV_AUTH_BYPASS === 'true';

module.exports = async function(req, res, next) {
  if (DEV_AUTH_BYPASS) {
    const teacherId = req.header('x-teacher-id');
    if (!teacherId) {
      return res.status(403).json({ msg: 'Admin access required' });
    }
    try {
      const teacher = await Teacher.findByPk(teacherId);
      if (!teacher?.is_admin) {
        return res.status(403).json({ msg: 'Admin access required' });
      }
      req.teacher = { id: teacherId };
      return next();
    } catch (err) {
      return res.status(500).json({ msg: 'Server error during auth check' });
    }
  }

  // Production: require Passport/Google session with admin flag
  if (req.isAuthenticated() && req.user && req.user.is_admin) {
    return next();
  }
  return res.status(403).json({ msg: 'Admin access required' });
};
