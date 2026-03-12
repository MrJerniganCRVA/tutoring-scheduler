const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Teacher = require('./Teacher');
const Student = require('./Student');
const Period = require('./Period');

// Stores which teacher a student has for each period.
// Replaces the CodeRVA-specific R1Id–R5Id FK columns on Student.
const StudentPeriodAssignment = sequelize.define('StudentPeriodAssignment', {
  TeacherId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  StudentId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  PeriodId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
});

StudentPeriodAssignment.belongsTo(Teacher, { foreignKey: 'TeacherId' });
StudentPeriodAssignment.belongsTo(Student, { foreignKey: 'StudentId' });
StudentPeriodAssignment.belongsTo(Period, { foreignKey: 'PeriodId' });

Student.hasMany(StudentPeriodAssignment);
Period.hasMany(StudentPeriodAssignment);

module.exports = StudentPeriodAssignment;
