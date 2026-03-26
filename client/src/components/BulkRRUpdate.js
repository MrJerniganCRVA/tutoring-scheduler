import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  CircularProgress
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import apiService from '../utils/apiService';

// Export one row per (student × period assignment).
// Students with no assignments get a single placeholder row.
function exportCSV(students) {
  const header = 'student_id,student_name,period_name,teacher_email';
  const rows = [];
  for (const s of students) {
    const name = `"${s.last_name}, ${s.first_name}"`;
    const assignments = s.StudentPeriodAssignments || [];
    if (assignments.length === 0) {
      rows.push(`${s.id},${name},,`);
    } else {
      for (const a of assignments) {
        rows.push(`${s.id},${name},${a.Period?.name ?? ''},${a.Teacher?.email ?? ''}`);
      }
    }
  }
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'period_assignments.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// Parse CSV into a list of per-student update objects.
// Returns [{ studentId, student, assignments: [{period, teacher, periodId, teacherId}], errors: [{csvRowNum, reason}] }]
function parseCSV(text, students, teachers, periods) {
  const studentById = {};
  for (const s of students) studentById[String(s.id)] = s;

  const teacherByEmail = {};
  for (const t of teachers) {
    if (t.email) teacherByEmail[t.email.toLowerCase()] = t;
  }

  const periodByName = {};
  for (const p of periods) periodByName[p.name.toLowerCase()] = p;

  const lines = text.trim().split(/\r?\n/);
  const dataLines = lines[0].toLowerCase().startsWith('student_id') ? lines.slice(1) : lines;

  // Accumulate rows grouped by studentId
  const byStudent = {};

  dataLines
    .filter(line => line.trim() !== '')
    .forEach((line, idx) => {
      const csvRowNum = idx + 2;
      const parts = parseCSVLine(line);
      if (parts.length < 4) {
        // Can't even identify the student; add a top-level error row
        const key = `__error_${csvRowNum}`;
        byStudent[key] = byStudent[key] || {
          studentId: null, student: null, assignments: [],
          errors: [{ csvRowNum, reason: 'Invalid row format (expected 4 columns)' }]
        };
        return;
      }

      const studentId = parts[0].trim();
      const periodName = parts[2].trim();
      const teacherEmail = parts[3].trim();

      if (!studentId) {
        const key = `__error_${csvRowNum}`;
        byStudent[key] = { studentId: null, student: null, assignments: [], errors: [{ csvRowNum, reason: 'Missing student ID' }] };
        return;
      }

      if (!byStudent[studentId]) {
        const student = studentById[studentId] || null;
        byStudent[studentId] = { studentId, student, assignments: [], errors: [] };
        if (!student) {
          byStudent[studentId].errors.push({ csvRowNum, reason: `Student ID "${studentId}" not found` });
        }
      }

      const entry = byStudent[studentId];

      // Skip rows that are blank placeholders (student has no assignments yet)
      if (!periodName && !teacherEmail) return;

      if (!periodName) {
        entry.errors.push({ csvRowNum, reason: 'Missing period name' });
        return;
      }
      if (!teacherEmail) {
        entry.errors.push({ csvRowNum, reason: 'Missing teacher email' });
        return;
      }

      const period = periodByName[periodName.toLowerCase()];
      if (!period) {
        entry.errors.push({ csvRowNum, reason: `Period "${periodName}" not found` });
        return;
      }

      const teacher = teacherByEmail[teacherEmail.toLowerCase()];
      if (!teacher) {
        entry.errors.push({ csvRowNum, reason: `No teacher found with email "${teacherEmail}"` });
        return;
      }

      entry.assignments.push({ period, teacher, periodId: period.id, teacherId: teacher.id });
    });

  return Object.values(byStudent);
}

const BulkRRUpdate = ({ open, onClose, onComplete, students, teachers, periods }) => {
  const [step, setStep] = useState(1);
  const [parsedStudents, setParsedStudents] = useState([]);
  const [parseError, setParseError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const fileInputRef = useRef();

  const reset = () => {
    setStep(1);
    setParsedStudents([]);
    setParseError('');
    setSubmitting(false);
    setSubmitResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setParseError('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = parseCSV(evt.target.result, students, teachers, periods);
        if (parsed.length === 0) {
          setParseError('No data rows found in the CSV file.');
          return;
        }
        setParsedStudents(parsed);
        setStep(2);
      } catch (err) {
        setParseError('Failed to parse CSV file. Please check the format.');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirm = async () => {
    const updates = parsedStudents
      .filter(s => s.student && s.errors.length === 0)
      .map(s => ({
        studentId: s.studentId,
        assignments: s.assignments.map(a => ({ periodId: a.periodId, teacherId: a.teacherId }))
      }));

    setSubmitting(true);
    setParseError('');
    try {
      const res = await apiService.bulkUpdatePeriods(updates);
      setSubmitResult(res.data);
      setStep(3);
    } catch (err) {
      setParseError(err.response?.data?.msg || 'Failed to submit updates.');
    } finally {
      setSubmitting(false);
    }
  };

  const validStudents = parsedStudents.filter(s => s.student && s.errors.length === 0);
  const errorStudents = parsedStudents.filter(s => !s.student || s.errors.length > 0);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>

      {/* Step 1 — Upload */}
      {step === 1 && (
        <>
          <DialogTitle>Bulk Period Import — Step 1: Upload CSV</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Upload a CSV with one row per student–period assignment. Use four columns:
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, fontFamily: 'monospace', fontSize: '0.8rem', bgcolor: 'grey.50', whiteSpace: 'pre' }}>
              {'student_id,student_name,period_name,teacher_email\n100000001,"Doe, John",Math,smith@school.edu\n100000001,"Doe, John",Science,jones@school.edu\n100000002,"Smith, Jane",Math,smith@school.edu'}
            </Paper>
            <Typography variant="body2" sx={{ mb: 2 }}>
              <strong>Tip:</strong> Export the current assignments first, update the <code>period_name</code> and <code>teacher_email</code> columns, then re-upload. The <code>student_name</code> column is ignored on import. Uploading a student's rows <strong>replaces</strong> all their current assignments.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={() => exportCSV(students)}
              >
                Export current assignments
              </Button>
              <Button
                variant="contained"
                component="label"
                startIcon={<UploadFileIcon />}
              >
                Choose CSV file
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  hidden
                  onChange={handleFileChange}
                />
              </Button>
            </Box>
            {parseError && <Alert severity="error">{parseError}</Alert>}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Cancel</Button>
          </DialogActions>
        </>
      )}

      {/* Step 2 — Preview */}
      {step === 2 && (
        <>
          <DialogTitle>Bulk Period Import — Step 2: Review Changes</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Chip label={`${validStudents.length} student${validStudents.length !== 1 ? 's' : ''} will update`} color="success" size="small" />
              {errorStudents.length > 0 && (
                <Chip label={`${errorStudents.length} with errors (skipped)`} color="error" size="small" />
              )}
            </Box>

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Student</strong></TableCell>
                    <TableCell><strong>New Assignments</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsedStudents.map((entry, i) => {
                    const hasErrors = !entry.student || entry.errors.length > 0;
                    const assignmentSummary = entry.assignments.length > 0
                      ? entry.assignments.map(a => `${a.period.name}: ${a.teacher.last_name}`).join(', ')
                      : '(no assignments)';
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          {entry.student
                            ? `${entry.student.first_name} ${entry.student.last_name}`
                            : entry.studentId ?? '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                          {hasErrors ? '—' : assignmentSummary}
                        </TableCell>
                        <TableCell>
                          {hasErrors ? (
                            <>
                              <Chip label="Error" color="error" size="small" />
                              {entry.errors.map((e, j) => (
                                <Typography key={j} variant="caption" display="block" color="error">
                                  Row {e.csvRowNum}: {e.reason}
                                </Typography>
                              ))}
                            </>
                          ) : (
                            <Chip label="Will update" color="success" size="small" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            {parseError && <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setStep(1); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
              Re-upload
            </Button>
            <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleConfirm}
              disabled={validStudents.length === 0 || submitting}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {submitting
                ? 'Updating…'
                : `Confirm (${validStudents.length} student${validStudents.length !== 1 ? 's' : ''})`}
            </Button>
          </DialogActions>
        </>
      )}

      {/* Step 3 — Results */}
      {step === 3 && submitResult && (
        <>
          <DialogTitle>Bulk Period Import — Done</DialogTitle>
          <DialogContent>
            <Alert
              severity={submitResult.failed.length === 0 ? 'success' : 'warning'}
              sx={{ mb: submitResult.failed.length > 0 ? 2 : 0 }}
            >
              {submitResult.succeeded.length} student{submitResult.succeeded.length !== 1 ? 's' : ''} updated
              {submitResult.failed.length > 0 && ` · ${submitResult.failed.length} failed`}
            </Alert>
            {submitResult.failed.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Failures:</Typography>
                {submitResult.failed.map((f, i) => (
                  <Typography key={i} variant="body2" color="error">
                    Student ID {f.studentId}: {f.reason}
                  </Typography>
                ))}
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={() => { handleClose(); onComplete(); }}>
              Close
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
};

export default BulkRRUpdate;
