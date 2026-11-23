const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Teacher = sequelize.define('Teacher', {
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
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: false
  },lunch:{
    type:DataTypes.STRING,
    allowNull:true,
    validate: {
      isIn: [['A','B','C','D']]
    }
  },
  google_id:{
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  access_token:{
    type:DataTypes.TEXT,
    allowNull:true
  },
  refresh_token:{
    type:DataTypes.TEXT,
    allowNull:true
  },
  token_expiry:{
    type:DataTypes.DATE,
    allowNull:true
  },
  is_admin:{
    type:DataTypes.BOOLEAN,
    allowNull:false,
    defaultValue:false
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
});

module.exports = Teacher;
