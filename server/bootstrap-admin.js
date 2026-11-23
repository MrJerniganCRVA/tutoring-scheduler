// One-time bootstrap: create the first admin Teacher row on a brand-new,
// empty database. Login only works for emails matching an existing Teacher
// row, and creating a Teacher via the API requires already being logged in -
// so a fresh database has no way to create its first teacher from within
// the app. This script breaks that deadlock with a direct DB insert.
//
// Usage (all required env vars):
//   ADMIN_ID=1001 ADMIN_FIRST_NAME=Jane ADMIN_LAST_NAME=Doe \
//   ADMIN_EMAIL=jane.doe@yourschool.org ADMIN_SUBJECT=Math ADMIN_LUNCH=C \
//   node bootstrap-admin.js
//
// Against a deployed database, run it with that deployment's DATABASE_URL set.
const sequelize = require('./config/db');
const Teacher = require('./models/Teacher');
const { isEmailAllowed, allowedEmailDomains } = require('./config/deployment');

const required = ['ADMIN_ID', 'ADMIN_FIRST_NAME', 'ADMIN_LAST_NAME', 'ADMIN_EMAIL', 'ADMIN_SUBJECT', 'ADMIN_LUNCH'];
const missing = required.filter(k => !process.env[k]);

async function main() {
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const id = Number(process.env.ADMIN_ID);
  const email = process.env.ADMIN_EMAIL;

  if (!Number.isInteger(id)) {
    console.error('ADMIN_ID must be an integer.');
    process.exit(1);
  }
  if (!isEmailAllowed(email)) {
    console.error(`ADMIN_EMAIL must be on ALLOWED_EMAIL_DOMAIN (${allowedEmailDomains.join(', ')}) - sign-in rejects any other domain.`);
    process.exit(1);
  }

  await sequelize.authenticate();

  const existingById = await Teacher.findByPk(id);
  if (existingById) {
    console.log(`Teacher ID ${id} already exists (${existingById.email}) - nothing to do.`);
    await sequelize.close();
    return;
  }
  const existingByEmail = await Teacher.findOne({ where: { email } });
  if (existingByEmail) {
    console.log(`A teacher with email ${email} already exists (ID ${existingByEmail.id}) - nothing to do.`);
    await sequelize.close();
    return;
  }

  const teacher = await Teacher.create({
    id,
    first_name: process.env.ADMIN_FIRST_NAME,
    last_name: process.env.ADMIN_LAST_NAME,
    email,
    subject: process.env.ADMIN_SUBJECT,
    lunch: process.env.ADMIN_LUNCH,
    is_admin: true
  });

  console.log(`Created admin teacher: ${teacher.first_name} ${teacher.last_name} (ID ${teacher.id}, ${teacher.email}). They can now sign in with Google and will see the admin-only Roster tab.`);
  await sequelize.close();
}

main().catch(err => {
  console.error('Bootstrap failed:', err.message);
  process.exit(1);
});
