const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sequelize = require('./config/db');
const passport = require('passport');
const { apiLimiter } = require('./middleware/rateLimiters');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const runMigration = process.env.RUN_MIGRATION === 'true';
const isProduction = process.env.NODE_ENV === 'production';

// CORS: allow frontend origin in dev and production
const allowedOrigin = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Trust the reverse proxy (the hosting platform's edge) so req.ip is the real client IP and secure cookies
// work behind HTTPS termination. Set unconditionally rather than gated on NODE_ENV: when
// it was gated, an unset NODE_ENV collapsed every user into a single rate-limit bucket.
//
// Parse defensively and fall back to 1. A blank or non-numeric TRUST_PROXY must never
// silently disable proxy trust: with secure cookies on, express-session drops Set-Cookie
// entirely when req.secure is false, so logins fail with no error anywhere. Keep the
// value numeric — `true` would let anyone spoof X-Forwarded-For past the rate limiters.
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY ?? '', 10);
app.set('trust proxy', Number.isInteger(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1);

console.log('[boot]', {
  nodeEnv: process.env.NODE_ENV || '(unset)',
  trustProxy: app.get('trust proxy'),
  clientUrl: allowedOrigin,
  secureCookies: isProduction
});

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Gzip compression for all responses
app.use(compression());

app.use(cors({
  origin: allowedOrigin,
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// Express derives req.secure from the FIRST value of X-Forwarded-Proto. Multi-hop proxy
// chains (the platform's edge plus, e.g., a school content filter) can present "http,https" or
// omit the header entirely, which makes req.secure false. express-session then refuses to
// send the session cookie -- no Set-Cookie, no error, no log line -- so the OAuth callback
// succeeds, the session is written, and the browser still ends up with no session at all.
// The platform terminates TLS at its edge, so in production the browser connection is always
// HTTPS regardless of what an intermediate hop reports. Keep the raw value for diagnostics,
// since normalising it would otherwise destroy the evidence of why this was needed.
if (isProduction) {
  app.use((req, res, next) => {
    req.rawForwardedProto = req.headers['x-forwarded-proto'] ?? '(absent)';
    req.headers['x-forwarded-proto'] = 'https';
    next();
  });
}

// Session store backed by the database
const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: 'sessions',
  checkExpirationInterval: 24*60*60*1000,
  expiration: 30*24*60*60*1000
});
sessionStore.sync();

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30*24*60*60*1000,
      secure: isProduction,
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax'
    }
  })
);

// express-session silently refuses to set a secure cookie when req.secure is false --
// no Set-Cookie, no error, no log line -- which makes every new login fail invisibly
// while existing sessions keep working. Surface that combination the first time it occurs.
if (isProduction) {
  let warnedInsecure = false;
  app.use((req, res, next) => {
    if (!warnedInsecure && !req.secure) {
      warnedInsecure = true;
      console.error(
        '[auth] FATAL CONFIG: secure cookies are enabled but req.secure is false, so no ' +
        'session cookie can be issued and every new sign-in will fail. Check trust proxy ' +
        'and that the proxy forwards X-Forwarded-Proto.',
        {
          trustProxy: app.get('trust proxy'),
          trustProxyEnv: process.env.TRUST_PROXY ?? '(unset)',
          xForwardedProto: req.get('x-forwarded-proto') || null,
          rawForwardedProto: req.rawForwardedProto ?? '(not captured)'
        }
      );
    }
    next();
  });
}

//passport init
app.use(passport.initialize());
app.use(passport.session());

// load passport
require('./config/passport')(passport);

// Simple test route — also reports how the proxy is resolving client IPs, so a bad
// trust-proxy setup can be diagnosed without a redeploy.
app.get('/', (req, res) => {
  res.json({
    msg: 'Welcome to the RR Tutoring Scheduler API',
    ip: req.ip,
    ips: req.ips,
    xForwardedFor: req.get('x-forwarded-for') || null,
    xForwardedProto: req.get('x-forwarded-proto') || null,
    rawForwardedProto: req.rawForwardedProto ?? '(not normalised)',
    protocol: req.protocol,
    secure: req.secure,
    nodeEnv: process.env.NODE_ENV || '(unset)'
  });
});
//Auth Routes
// Limiters are applied per-route inside routes/auth.js so the OAuth endpoints and the
// cheap session reads get separate budgets rather than sharing one.
app.use('/auth', require('./routes/auth'));

// Define routes
app.use('/api/analytics', apiLimiter, require('./routes/analytics'));
app.use('/api/teachers', apiLimiter, require('./routes/teachers'));
app.use('/api/students', apiLimiter, require('./routes/students'));
app.use('/api/tutoring', apiLimiter, require('./routes/tutoring'));
app.use('/api/calendar', apiLimiter, require('./routes/calendar'));
app.use('/api/notifications', apiLimiter, require('./routes/notifications'));
app.use('/api/caseload', apiLimiter, require('./routes/caseload'));
app.use('/api/admin', apiLimiter, require('./middleware/auth'), require('./middleware/requireAdmin'), require('./routes/admin'));


if(runMigration){

  console.log('Starting migration');
  sequelize.sync({ alter: true })
    .then(()=> {
      console.log('Migration Completed');
      process.exit(0);
    }).catch(e => {
      console.error('Migration failed', e);
      process.exit(1);
    });


} else{

// Test database connection
sequelize.authenticate()
  .then(() => {
    console.log('Database connected successfully');
    sequelize.sync().then(()=>{
      app.listen(PORT, () => console.log(`Server running on port:${PORT}`));
      console.log("Listening");
    })
    .catch((err)=>{
      console.error("Unable to connect", err);
    });
  })
  .catch(err => console.error('Unable to connect to the database:', err));
}
