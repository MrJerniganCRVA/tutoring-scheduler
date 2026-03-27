const DEV_AUTH_BYPASS = process.env.DEV_AUTH_BYPASS === 'true';

module.exports = function(req, res, next) {
  if (DEV_AUTH_BYPASS) {
    const teacherId = req.header('x-teacher-id');
    if (!teacherId) {
      return res.status(401).json({ msg: 'Not authenticated. Please select a teacher.' });
    }
    req.teacher = { id: teacherId };
    return next();
  }

  // Production: require Passport/Google session
  if (req.isAuthenticated()) {
    req.teacher = { id: req.user.id };
    return next();
  }
  return res.status(401).json({ msg: 'Not authenticated. Please login.' });
};
