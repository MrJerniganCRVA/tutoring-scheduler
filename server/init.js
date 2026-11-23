// init.js
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { confirmDestructiveReset } = require('./utils/destructiveGuard');

// Define database path (must match the SQLite storage path in config/db.js)
const dbPath = path.join(__dirname, 'database.db');

const sequelize = require('./config/db')

// Define models
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const Enrollment = require('./models/Enrollment');
const TutoringRequest = require('./models/TutoringRequest');

// Function to initialize database and add test data
async function initDatabase() {
  try {
    await confirmDestructiveReset('db:seed-dev (init.js)');

    // Delete the existing database file if it exists
    if (fs.existsSync(dbPath)) {
      console.log('Removing existing database...');
      fs.unlinkSync(dbPath);
    }

    // Sync models to create tables
    await sequelize.sync({ force: true });
    console.log('Database initialized successfully');

    // Create sample teachers
    const teachers = await Teacher.bulkCreate([
      {
        id: 1,
        first_name: 'Alice',
        last_name:'Johnson',
        email: 'ajohnson@school.edu',
        subject: 'Math',
        lunch: 'A'
      },
      {
        id: 2,
        first_name: 'Bob',
        last_name: 'Smith',
        email: 'bsmith@school.edu',
        subject: 'Humanities',
        lunch: 'B'
      },
      {
        id: 3,
        first_name: 'Carol',
        last_name: 'Williams',
        email: 'cwilliams@school.edu',
        subject: 'Science',
        lunch: 'C'
      },
      {
        id: 4,
        first_name: 'David',
        last_name: 'Locke',
        email: 'dlocke@school.edu',
        subject: 'CS',
        lunch: 'D'
      }, {
        // Change this email to your own Google account before seeding, or
        // you won't be able to sign in to the sample data.
        id:10015,
        first_name: 'Demo',
        last_name:'Admin',
        email: 'demo.admin@coderva.org',
        subject:'CS',
        lunch: 'C',
        is_admin: true
      }
    ]);

    console.log('Sample teachers created');

    // Get the teacher IDs
    const teacherIds = teachers.map(teacher => teacher.id);
    
    // Create sample students, then their teacher assignments as separate
    // Enrollment rows (period -> teacher) rather than fixed FK columns.
    const students = [];
    const enrollmentsByPeriod = [];

    const addStudentWithAssignments = (student, assignments) => {
      students.push(student);
      for (const [period, teacherId] of Object.entries(assignments)) {
        if (teacherId) enrollmentsByPeriod.push({ StudentId: student.id, period, TeacherId: teacherId });
      }
    };

    addStudentWithAssignments(
      { id: 24000001, first_name: 'Testing', last_name: 'StudentA', email: 'test.studenta@students.coderva.org' },
      { R1: 1, R2: 10015, RR: 10015, R4: 2, R5: 3 }
    );
    addStudentWithAssignments(
      { id: 250000001, first_name: 'Test', last_name: 'StudentB', email: 'test.studentb@students.coderva.org' },
      { R1: 2, R2: 10015, RR: 3, R4: 1, R5: 3 }
    );

    const firstNames = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Lucas', 'Isabella', 'Mason'];
    const lastNames = ['Smith', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Miller', 'Taylor', 'Anderson', 'Thomas', 'Jackson'];

    for (let i = 0; i < 10; i++) {
      const firstName = firstNames[i % firstNames.length];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@students.coderva.org`;

      // Randomly assign teachers - for simplicity, the same teacher may end
      // up assigned to multiple periods sometimes.
      addStudentWithAssignments(
        { id: 100000000 + i, first_name: firstName, last_name: lastName, email },
        {
          R1: teacherIds[Math.floor(Math.random() * teacherIds.length)],
          R2: teacherIds[Math.floor(Math.random() * teacherIds.length)],
          RR: teacherIds[Math.floor(Math.random() * teacherIds.length)],
          R4: teacherIds[Math.floor(Math.random() * teacherIds.length)],
          R5: teacherIds[Math.floor(Math.random() * teacherIds.length)]
        }
      );
    }

    await Student.bulkCreate(students);
    await Enrollment.bulkCreate(enrollmentsByPeriod);
    console.log('Sample students created');

    // Create some sample tutoring requests
    const allStudents = await Student.findAll();
    
    // Get today's date and format it for SQLite
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    
    // Create a few sample tutoring requests
    const requests = [];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate()+1);
    const formatDate = (date) => date.toISOString().split('T')[0];
    requests.push({
      TeacherId: 10015,
      StudentId: 24000001,
      date: formatDate(tomorrow),
      lunchA: false,
      lunchB: true,
      lunchC: false,
      lunchD: false,
      status:'active',
      invite_sent: false
    });
    for (let i = 0; i < 5; i++) {
      const student = allStudents[Math.floor(Math.random() * allStudents.length)];
      const teacher = teachers[Math.floor(Math.random() * teachers.length)];
      
      requests.push({
        TeacherId: teacher.id,
        StudentId: student.id,
        date: formattedDate,
        lunchA: Math.random() > 0.5,
        lunchB: Math.random() > 0.5,
        lunchC: Math.random() > 0.5,
        lunchD: Math.random() > 0.5,
        status: 'active',
        invite_sent: false
      });
    }
    
    await TutoringRequest.bulkCreate(requests);
    console.log('Sample tutoring requests created');

    console.log('Database initialization completed successfully');
    
    // Display information about what was created
    console.log('\nDatabase Summary:');
    console.log('----------------');
    console.log(`Teachers created: ${teachers.length}`);
    console.log(`Students created: ${students.length}`);
    console.log(`Tutoring requests created: ${requests.length}`);
    console.log('\nTeacher details:');
    teachers.forEach(teacher => {
      console.log(`- ${teacher.last_name} (${teacher.subject}, Lunch ${teacher.lunch})`);
    });
    
    // Close the database connection
    await sequelize.close()
    .then(()=>console.log("Database Closed"));
    
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}

// Run the initialization
initDatabase();
