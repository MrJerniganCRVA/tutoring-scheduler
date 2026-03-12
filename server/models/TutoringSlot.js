const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// A TutoringSlot represents any configurable school time block during which
// tutoring can occur (e.g. "A Lunch", "Study Hall", "After School").
// Admin-configurable: schools create as many slots as they need.
const TutoringSlot = sequelize.define('TutoringSlot', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  startTime: {
    type: DataTypes.STRING, // HH:MM format
    allowNull: false
  },
  endTime: {
    type: DataTypes.STRING, // HH:MM format
    allowNull: false
  }
});

module.exports = TutoringSlot;
