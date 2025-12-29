function isAuthenticated(req, res, next) {
  if (req.session.userId) return next();
  req.flash("error_msg", "Please log in first.");
  return res.redirect("/login");
}

function isAdmin(req, res, next) {
  if (req.session.role === "admin") return next();
  req.flash("error_msg", "Unauthorized access.");
  return res.redirect("/dashboard");
}
module.exports = { isAuthenticated, isAdmin };
