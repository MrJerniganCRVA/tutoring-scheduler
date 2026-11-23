const sequelize = require('./config/db');
const { confirmDestructiveReset } = require('./utils/destructiveGuard');

// Models must be required so Sequelize knows about them before sync() -
// sync() only creates tables for models that have been registered on this
// sequelize instance in the current process.
require('./models/Teacher');
require('./models/Student');
require('./models/Enrollment');
require('./models/TutoringRequest');
require('./models/Notification');

async function migrate(){
    try{
        await confirmDestructiveReset('db:reset-dev (migrate.js)');
        console.log('Starting migration');
        await sequelize.sync({ force: true});
        console.log('Migration complete');
        await sequelize.close();
        process.exit(0);

    } catch (e) {
        console.error('Migration failed', e);
        process.exit(1);
    }
}

migrate();