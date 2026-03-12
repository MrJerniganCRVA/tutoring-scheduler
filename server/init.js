// init.js — seeds a fresh development database with generic placeholder data
const path = require('path');
const fs = require('fs');

// Delete the existing SQLite database file if it exists
const dbPath = path.join(__dirname, 'database.db');
if (fs.existsSync(dbPath)) {
  console.log('Removing existing database...');
  fs.unlinkSync(dbPath);
}

const sequelize = require('./config/db');

const SchoolConfig = require('./models/SchoolConfig');
const TutoringSlot = require('./models/TutoringSlot');
const Period = require('./models/Period');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const TutoringRequest = require('./models/TutoringRequest');
// Load StudentPeriodAssignment to register its associations
require('./models/StudentPeriodAssignment');

async function initDatabase() {
  try {
    await sequelize.sync({ force: true });
    console.log('Database initialized successfully');

    // -----------------------------------------------------------------------
    // SchoolConfig defaults
    // -----------------------------------------------------------------------
    await SchoolConfig.bulkCreate([
      { key: 'school_name',             value: 'Demo School' },
      { key: 'allowed_email_domain',    value: null },           // null = allow any domain
      { key: 'calendar_timezone',       value: 'America/New_York' },
      { key: 'calendar_event_prefix',   value: 'Tutoring' },
      { key: 'tutoring_period_name',    value: 'Tutoring Session' },
      { key: 'no_tutoring_days',        value: JSON.stringify([0, 6]) }, // weekends only
      { key: 'subject_priority_enabled',value: 'false' },
      { key: 'subject_priority_map',    value: JSON.stringify({}) },
      { key: 'require_slot_match',      value: 'true' }
    ]);
    console.log('SchoolConfig defaults seeded');

    // -----------------------------------------------------------------------
    // TutoringSlots — example lunch schedule; admins can edit/replace these
    // -----------------------------------------------------------------------
    const slots = await TutoringSlot.bulkCreate([
      { name: 'A Lunch', order: 0, startTime: '11:02', endTime: '11:25' },
      { name: 'B Lunch', order: 1, startTime: '11:28', endTime: '11:51' },
      { name: 'C Lunch', order: 2, startTime: '11:54', endTime: '12:17' },
      { name: 'D Lunch', order: 3, startTime: '12:20', endTime: '12:44' }
    ]);
    console.log('TutoringSlots seeded');

    // -----------------------------------------------------------------------
    // Periods — example 5-period day; admins can edit/replace these
    // -----------------------------------------------------------------------
    const periods = await Period.bulkCreate([
      { name: 'Period 1', order: 0 },
      { name: 'Period 2', order: 1 },
      { name: 'Period 3', order: 2 },
      { name: 'Period 4', order: 3 },
      { name: 'Period 5', order: 4 }
    ]);
    console.log('Periods seeded');

    // -----------------------------------------------------------------------
    // Teachers
    // -----------------------------------------------------------------------
    const teachers = await Teacher.bulkCreate([
      { id: 1,  first_name: 'Alice', last_name: 'Johnson',  email: 'ajohnson@school.edu',  subject: 'Math',       is_admin: true },
      { id: 2,  first_name: 'Bob',   last_name: 'Smith',    email: 'bsmith@school.edu',    subject: 'Humanities', is_admin: false },
      { id: 3,  first_name: 'Carol', last_name: 'Williams', email: 'cwilliams@school.edu', subject: 'Science',    is_admin: false },
      { id: 4,  first_name: 'David', last_name: 'Locke',    email: 'dlocke@school.edu',    subject: 'CS',         is_admin: false }
    ]);
    console.log('Teachers seeded');

    // Assign each teacher to slots that match their lunch availability
    await teachers[0].setTutoringSlots([slots[0]]);           // Alice → A Lunch
    await teachers[1].setTutoringSlots([slots[1]]);           // Bob   → B Lunch
    await teachers[2].setTutoringSlots([slots[2]]);           // Carol → C Lunch
    await teachers[3].setTutoringSlots([slots[3]]);           // David → D Lunch

    // -----------------------------------------------------------------------
    // Students
    // -----------------------------------------------------------------------
    const firstNames = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Lucas', 'Isabella', 'Mason'];
    const lastNames  = ['Smith', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Miller', 'Taylor', 'Anderson', 'Thomas', 'Jackson'];

    const studentData = firstNames.map((firstName, i) => ({
      id: 100000000 + i,
      first_name: firstName,
      last_name: lastNames[i],
      email: `${firstName.toLowerCase()}.${lastNames[i].toLowerCase()}@student.school.edu`
    }));

    const students = await Student.bulkCreate(studentData);
    console.log('Students seeded');

    // Assign each student to a slot (round-robin across the 4 slots)
    for (let i = 0; i < students.length; i++) {
      await students[i].setTutoringSlots([slots[i % slots.length]]);
    }

    // -----------------------------------------------------------------------
    // StudentPeriodAssignments — each student gets a teacher per period
    // -----------------------------------------------------------------------
    const StudentPeriodAssignment = require('./models/StudentPeriodAssignment');
    const assignments = [];
    students.forEach(student => {
      periods.forEach((period, idx) => {
        assignments.push({
          StudentId: student.id,
          PeriodId: period.id,
          TeacherId: teachers[idx % teachers.length].id
        });
      });
    });
    await StudentPeriodAssignment.bulkCreate(assignments);
    console.log('StudentPeriodAssignments seeded');

    // -----------------------------------------------------------------------
    // TutoringRequests
    // -----------------------------------------------------------------------
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formatDate = (d) => d.toISOString().split('T')[0];

    const request = await TutoringRequest.create({
      TeacherId: teachers[0].id,
      StudentId: students[0].id,
      date: formatDate(tomorrow),
      status: 'active',
      invite_sent: false
    });
    await request.setTutoringSlots([slots[0]]);
    console.log('Sample TutoringRequest seeded');

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------
    console.log('\nDatabase Summary:');
    console.log('----------------');
    console.log(`SchoolConfig entries: 9`);
    console.log(`TutoringSlots:  ${slots.length}`);
    console.log(`Periods:        ${periods.length}`);
    console.log(`Teachers:       ${teachers.length}`);
    console.log(`Students:       ${students.length}`);
    console.log(`Assignments:    ${assignments.length}`);
    console.log('\nTo customize this school\'s settings, use the admin panel or PUT /api/admin/config');

    await sequelize.close();
    console.log('Database connection closed');

  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

initDatabase();
