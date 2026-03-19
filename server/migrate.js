const sequelize = require('./config/db');

// Import all models so Sequelize registers them before sync
require('./models/SchoolConfig');
require('./models/TutoringSlot');
require('./models/Period');
require('./models/Teacher');       // registers TeacherTutoringSlots join
require('./models/Student');       // registers StudentTutoringSlots join
require('./models/TutoringRequest'); // registers TutoringRequestSlots join
require('./models/StudentPeriodAssignment'); // registers Student/Period/Teacher associations

async function migrate(){
    try{
        console.log('Starting migration');
        await sequelize.sync({ force: true });
        console.log('Migration complete');
        process.exit(0);

    } catch (e) {
        console.error('Migration failed', e);
        process.exit(1);
    }
}

migrate();
