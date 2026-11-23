const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const Student = require('./Student');
const Teacher = require('./Teacher');

// Replaces the old fixed R1Id/R2Id/RRId/R4Id/R5Id columns on Student with a
// proper many-to-many join table. `period` is a free-form label ('R1', 'R2',
// 'RR', 'R4', 'R5', or anything else like 'Online-CS') so a student can have
// any number of class assignments, not just the five original rotation slots.
const Enrollment = sequelize.define('Enrollment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  period: {
    type: DataTypes.STRING,
    allowNull: false
  },
  schoolYear: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  indexes: [
    // At most one teacher per named period per student - same behavior as
    // the old single-column-per-slot design.
    { unique: true, fields: ['StudentId', 'period'] }
  ]
});

Enrollment.belongsTo(Student, { foreignKey: { allowNull: false } });
Enrollment.belongsTo(Teacher, { foreignKey: { allowNull: false } });
Student.hasMany(Enrollment);
Teacher.hasMany(Enrollment);

module.exports = Enrollment;
