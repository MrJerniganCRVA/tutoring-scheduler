const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Shared 429 responder: makes it obvious a limit came from THIS server rather than
// Google, and leaves a line in the logs naming which limiter tripped and on what key.
const limitHandler = (name) => (req, res) => {
  console.warn(`[ratelimit] ${name} tripped`, {
    ip: req.ip,
    ips: req.ips,
    teacherId: req.user?.id ?? null,
    path: req.originalUrl,
    ua: req.get('user-agent')
  });
  res.status(429)
    .set('X-RateLimit-Source', `rr-tutoring-server:${name}`)
    .json({
      msg: 'Too many requests to the tutoring server. Please wait a few minutes and try again.',
      limiter: name
    });
};

// Teachers all share one public IP behind the school's NAT, so key by teacher whenever a
// session exists. ipKeyGenerator is required in v8 to normalise IPv6 into a subnet.
const userOrIpKey = (req) => (req.user?.id ? `teacher:${req.user.id}` : ipKeyGenerator(req.ip));

const build = (name, limit, keyGenerator) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  handler: limitHandler(name)
});

// OAuth start/callback only. There is no password here — /auth/google just redirects to
// Google and the callback needs a Google-signed code — so this guards against redirect
// loops and traffic abuse, not credential stuffing. Sized for a whole staff on one IP:
// each sign-in costs 2 requests, so 100 covers ~50 logins per window.
const oauthLimiter = build('oauth', 100, (req) => ipKeyGenerator(req.ip));

// Cheap session reads (/auth/current, /auth/logout). These used to share the OAuth
// budget, which is what locked teachers out of logging in.
const sessionLimiter = build('session', 500, userOrIpKey);

// General API limit.
const apiLimiter = build('api', 200, userOrIpKey);

module.exports = { oauthLimiter, sessionLimiter, apiLimiter };
