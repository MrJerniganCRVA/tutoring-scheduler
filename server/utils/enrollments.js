const Teacher = require('../models/Teacher');
const Enrollment = require('../models/Enrollment');

const TEACHER_PUBLIC_ATTRS = ['id', 'first_name', 'last_name', 'subject', 'lunch'];
// Just enough to render a name. Used by endpoints that return people as a
// label on someone else's record (e.g. a tutoring request's teacher, or the
// student's RR teacher) rather than as the subject of the response.
const TEACHER_LEAN_ATTRS = ['id', 'first_name', 'last_name'];
const STUDENT_LEAN_ATTRS = ['id', 'first_name', 'last_name'];
const KNOWN_PERIODS = ['R1', 'R2', 'RR', 'R4', 'R5'];

// Eager-load config for fetching a Student (or a TutoringRequest's nested
// Student) so reshapeStudent() below has what it needs.
const STUDENT_ENROLLMENT_INCLUDE = {
  model: Enrollment,
  include: [{ model: Teacher, attributes: TEACHER_PUBLIC_ATTRS }]
};

// Reshapes a Student instance (loaded with STUDENT_ENROLLMENT_INCLUDE) into
// the response shape existing client code already expects - .R1/.R1Id,
// .R2/.R2Id, .RR/.RRId, .R4/.R4Id, .R5/.R5Id (all null if unassigned) - plus
// a generic `.enrollments` array covering every period, known or not, so a
// student can have additional class assignments (e.g. an online class)
// beyond the five original rotation slots without another schema change.
function reshapeStudent(studentInstance) {
  const data = studentInstance.toJSON ? studentInstance.toJSON() : { ...studentInstance };
  const enrollments = data.Enrollments || [];

  const byPeriod = {};
  for (const e of enrollments) byPeriod[e.period] = e.Teacher;

  for (const period of KNOWN_PERIODS) {
    const teacher = byPeriod[period] || null;
    data[period] = teacher;
    data[`${period}Id`] = teacher?.id ?? null;
  }

  data.enrollments = enrollments.map(e => ({ period: e.period, teacher: e.Teacher }));
  delete data.Enrollments;

  // Preserves the old addLunch() behavior: a student's lunch period is
  // derived from their RR teacher's lunch.
  data.lunch = data.RR?.lunch ?? null;

  return data;
}

// Upserts (or deletes, if teacherId is null/undefined) the single Enrollment
// row for (studentId, period). Used instead of setting a column directly -
// this is what makes reassigning e.g. RR a single lightweight row swap.
async function setEnrollment(studentId, period, teacherId) {
  if (teacherId === null || teacherId === undefined) {
    await Enrollment.destroy({ where: { StudentId: studentId, period } });
    return null;
  }
  const existing = await Enrollment.findOne({ where: { StudentId: studentId, period } });
  if (existing) {
    await existing.update({ TeacherId: teacherId });
    return existing;
  }
  return Enrollment.create({ StudentId: studentId, period, TeacherId: teacherId });
}

// Applies a { period: teacherId } map in one call (e.g. { R1: 5, RR: 12 }) -
// keys with an undefined value are left untouched, null clears that period.
async function setEnrollments(studentId, periodMap) {
  for (const [period, teacherId] of Object.entries(periodMap)) {
    if (teacherId === undefined) continue;
    await setEnrollment(studentId, period, teacherId);
  }
}

module.exports = {
  TEACHER_PUBLIC_ATTRS,
  TEACHER_LEAN_ATTRS,
  STUDENT_LEAN_ATTRS,
  KNOWN_PERIODS,
  STUDENT_ENROLLMENT_INCLUDE,
  reshapeStudent,
  setEnrollment,
  setEnrollments
};
