import React, { useState } from 'react';
import {
  Chip,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import StudentSessionsDialog from './StudentSessionsDialog';

// Per-student tutoring totals: sessions attended, service minutes, absences,
// minutes by subject (the tutoring teacher's subject) and by teacher. Absent
// sessions count only toward Absences. Rows come straight from
// /api/caseload or /api/admin/students/:id/tutoring.
//
// Clicking a name opens StudentSessionsDialog with every session in `range`;
// `loadDetail(studentId, range)` fetches it (caseload- or admin-scoped).
const TutoringSummaryTable = ({ students, range, loadDetail }) => {
  const [selected, setSelected] = useState(null);

  return (
    <>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><strong>Student</strong></TableCell>
              <TableCell align="right"><strong>Sessions</strong></TableCell>
              <TableCell align="right"><strong>Minutes</strong></TableCell>
              <TableCell align="right"><strong>Absences</strong></TableCell>
              <TableCell><strong>By subject</strong></TableCell>
              <TableCell><strong>Tutored by</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {students.map(student => (
              <TableRow key={student.id} hover>
                <TableCell>
                  <Link component="button" variant="body2" onClick={() => setSelected(student)} sx={{ textAlign: 'left' }}>
                    {student.last_name}, {student.first_name}
                  </Link>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{student.totalSessions}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{student.totalMinutes}</TableCell>
                <TableCell
                  align="right"
                  sx={{ fontWeight: 600, color: student.totalAbsences > 0 ? 'warning.main' : 'text.secondary' }}
                >
                  {student.totalAbsences || 0}
                </TableCell>
                {student.totalSessions === 0 ? (
                  <TableCell colSpan={2}>
                    <Typography variant="body2" color="text.secondary">
                      {student.totalAbsences > 0 ? 'No sessions attended in this date range' : 'No tutoring in this date range'}
                    </Typography>
                  </TableCell>
                ) : (
                  <>
                    <TableCell>
                      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                        {student.bySubject.map(s => (
                          <Chip key={s.subject} size="small" color="primary" variant="outlined" label={`${s.subject} · ${s.minutes} min`} />
                        ))}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                        {student.byTeacher.map(t => (
                          <Chip
                            key={t.teacherId}
                            size="small"
                            variant="outlined"
                            label={`${t.name} (${t.subject}) · ${t.sessions}`}
                          />
                        ))}
                      </Stack>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <StudentSessionsDialog
        student={selected}
        range={range}
        loadDetail={loadDetail}
        onClose={() => setSelected(null)}
      />
    </>
  );
};

export default TutoringSummaryTable;
