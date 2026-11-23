// Students a teacher should see as "mine" when scheduling tutoring - any
// student with an enrollment naming this teacher, excluding RR (a student's
// RR/homeroom teacher isn't who they'd request tutoring from for a subject).
// This now includes any period, not just the original R1/R2/R4/R5 slots, so
// e.g. a student in an online class taught by this teacher shows up too.
export function getMyStudents(students, teacherId) {
  const id = parseInt(teacherId, 10);
  if (!id) return [];
  return students.filter(student =>
    (student.enrollments || []).some(e => e.period !== 'RR' && e.teacher?.id === id)
  );
}
