const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const Student = require('../models/Student');
const auth = require('../middleware/auth');
const { STUDENT_LEAN_ATTRS } = require('../utils/enrollments');

// The shape the client reads. `message` is already rendered server-side, so the
// rest is only what the bell menu needs to sort, group and link.
function toLeanNotification(instance) {
  const data = instance.toJSON ? instance.toJSON() : instance;
  return {
    id: data.id,
    type: data.type,
    message: data.message,
    relatedDate: data.relatedDate,
    read: data.read,
    createdAt: data.createdAt,
    Student: data.Student
      ? { id: data.Student.id, first_name: data.Student.first_name, last_name: data.Student.last_name }
      : null
  };
}

// @route   GET /api/notifications
// @desc    Get the caller's own notifications, newest first
// @access  Private
//
// Query params:
//   unread=true   only notifications the teacher hasn't opened yet
router.get('/', auth, async (req, res) => {
  try {
    const where = { TeacherId: req.teacher.id };
    if (req.query.unread === 'true') where.read = false;

    const notifications = await Notification.findAll({
      where,
      include: [{ model: Student, attributes: STUDENT_LEAN_ATTRS }],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      notifications: notifications.map(toLeanNotification),
      unreadCount: notifications.filter(n => !n.read).length
    });
  } catch (err) {
    console.error('Error fetching notifications:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PATCH /api/notifications/read-all
// @desc    Mark every unread notification for the caller as read
// @access  Private
//
// Registered before '/:id/read' is irrelevant here (the paths don't overlap),
// but kept adjacent to it for readability.
router.patch('/read-all', auth, async (req, res) => {
  try {
    const [updated] = await Notification.update(
      { read: true, readAt: new Date() },
      { where: { TeacherId: req.teacher.id, read: false } }
    );
    res.json({ msg: `Marked ${updated} notification(s) as read`, updated });
  } catch (err) {
    console.error('Error marking all notifications read:', err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PATCH /api/notifications/:id/read
// @desc    Mark one notification as read
// @access  Private
router.patch('/:id/read', auth, async (req, res) => {
  try {
    // Scoping the lookup to the caller is the authorization check - a teacher
    // can only ever touch their own notifications.
    const notification = await Notification.findOne({
      where: { id: req.params.id, TeacherId: req.teacher.id }
    });

    if (!notification) {
      return res.status(404).json({ msg: 'Notification not found' });
    }

    if (!notification.read) {
      await notification.update({ read: true, readAt: new Date() });
    }

    res.json({ msg: 'Notification marked as read', notification: toLeanNotification(notification) });
  } catch (err) {
    console.error('Error marking notification read:', err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
