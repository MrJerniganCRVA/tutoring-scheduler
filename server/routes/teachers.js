const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');
const auth = require('../middleware/auth');

// @route   GET api/teachers
// @desc    Get all teachers
// @access  Public
router.get('/', async (req, res) => {
  try {
    const teachers = await Teacher.findAll();
    res.json(teachers);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/teachers/:id
// @desc    Get teacher by ID
// @access  Public
router.get('/:id', auth, async (req, res) => {
  try {
    const teacher = await Teacher.findByPk(req.params.id);
    
    if (!teacher) {
      return res.status(404).json({ msg: 'Teacher not found' });
    }
    
    res.json(teacher);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/teachers
// @desc    Add a new teacher
// @access  Public
router.post('/', auth, async (req, res) => {
  try{
    const {first_name, last_name, email, subject, lunch} = req.body;
    //Create table if none exist
    try{
      await sequelize.query("SELECT * FROM Teachers LIMIT 1",
        {type:sequelize.QueryTypes.SELECT}
      );
    } catch (err){
      await Teacher.sync({force: false});
    }
    // Check if teacher already exists
    let teacher = await Teacher.findOne({ where: { email } });
    
    if (teacher) {
      return res.status(400).json({ msg: 'Teacher already exists' });
    }
    
    // Create teacher
    teacher = await Teacher.create({
      first_name,
      last_name,
      email,
      subject,
      lunch
    });
    
    res.json(teacher);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
