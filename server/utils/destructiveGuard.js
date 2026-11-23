const readline = require('readline');

function maskConnectionString(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

// Guards a destructive drop-and-recreate script. Refuses outright when
// DATABASE_URL is set (that's the real Postgres DB, never local SQLite)
// unless explicitly overridden, and always requires a typed confirmation.
async function confirmDestructiveReset(label) {
  const isProdLike = !!process.env.DATABASE_URL;

  if (isProdLike && process.env.ALLOW_DESTRUCTIVE_RESET !== 'yes') {
    console.error(
      `\nRefusing to run "${label}": DATABASE_URL is set, which means this would run against ` +
      `the real Postgres database (${maskConnectionString(process.env.DATABASE_URL)}), not local SQLite.\n` +
      `This script drops and recreates every table. If you really mean to do this, re-run with ` +
      `ALLOW_DESTRUCTIVE_RESET=yes set.\n`
    );
    process.exit(1);
  }

  const target = isProdLike
    ? `the Postgres database at ${maskConnectionString(process.env.DATABASE_URL)}`
    : 'the local SQLite database';

  console.warn(`\n!!! "${label}" will PERMANENTLY DROP AND RECREATE every table in ${target}. !!!\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question('Type RESET to continue, anything else to cancel: ', resolve);
  });
  rl.close();

  if (answer.trim() !== 'RESET') {
    console.log('Cancelled.');
    process.exit(1);
  }
}

module.exports = { confirmDestructiveReset };
