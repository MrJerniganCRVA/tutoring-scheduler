const express = require('express');
const cors = require('cors');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sequelize = require('./config/db');
const passport = require('passport');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const runMigration = process.env.RUN_MIGRATION === 'true';
const isProduction = process.env.NODE_ENV === 'production';

// Trust Railway's reverse proxy so secure cookies work behind HTTPS termination
if (isProduction) {
  app.set('trust proxy', 1);
}

// CORS: allow frontend origin in dev and production
const allowedOrigin = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/+$/, '');
app.use(cors({
  origin: allowedOrigin,
  credentials: true
}));

app.use(express.json());

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

//passport init
app.use(passport.initialize());
app.use(passport.session());

// load passport
require('./config/passport')(passport);

// Simple test route
app.get('/', (req, res) => {
  res.json({ msg: 'Welcome to the Tutoring Scheduler API' });
});

// Auth Routes
app.use('/auth', require('./routes/auth'));

// API Routes
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/teachers', require('./routes/teachers'));
app.use('/api/students', require('./routes/students'));
app.use('/api/tutoring', require('./routes/tutoring'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/admin', require('./routes/admin'));


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
