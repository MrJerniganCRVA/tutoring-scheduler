// Requires the user to be authenticated AND have is_admin === true
module.exports = function(req, res, next) {
  if (req.isAuthenticated() && req.user && req.user.is_admin) {
    return next();
  }
  return res.status(403).json({ msg: 'Admin access required' });
};
