//session based auth
module.exports = function(req, res, next) {
  if(req.isAuthenticated()){
    req.teacher = {id: req.user.id};
    next();
  } else{
    return res.status(401).json({
      msg: 'Not authenticated in middleware. Please login'
    });
  };
};
