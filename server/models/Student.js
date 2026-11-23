const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Student = sequelize.define('Student', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  first_name: {
    type:DataTypes.STRING,
    allowNull: false
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type:DataTypes.STRING,
    allowNull:false,
    validate: {
      isEmail:true
    }
  },
  schoolYear: {
    type: DataTypes.STRING,
    allowNull: true
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
});

// Teacher assignments now live in the Enrollment join table (see
// models/Enrollment.js) rather than fixed FK columns here.

module.exports = Student;
