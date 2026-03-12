const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const TutoringSlot = require('./TutoringSlot');

const Student = sequelize.define('Student', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true
    }
  }
});

// A student is available during one or more TutoringSlots
Student.belongsToMany(TutoringSlot, { through: 'StudentTutoringSlots' });
TutoringSlot.belongsToMany(Student, { through: 'StudentTutoringSlots' });

module.exports = Student;
