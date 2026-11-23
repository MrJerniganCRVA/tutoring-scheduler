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

// The same upload flow assigns either RR homerooms or SPED case managers -
// both are one teacher per student for a named period (see the Enrollment
// model). Everything period-specific lives here.
const PERIOD_CONFIG = {
  RR: {
    title: 'Bulk RR Update',
    teacherLabel: 'RR',
    column: 'rr_teacher',
    describe: 'RR teacher assignments',
    filename: 'rr_assignments.csv'
  },
  SPED: {
    title: 'Bulk Caseload Update',
    teacherLabel: 'Case Manager',
    column: 'case_manager_email',
    describe: 'SPED case manager assignments (a student can have one case manager)',
    filename: 'sped_caseloads.csv'
  }
};

const currentTeacherOf = (student, period) =>
  (student.enrollments || []).find(e => e.period === period)?.teacher ?? null;

function exportCSV(students, teachers, period) {
  const { column, filename } = PERIOD_CONFIG[period];
  const emailById = {};
  for (const t of teachers) emailById[t.id] = t.email;
  const header = `student_id,student_name,${column}`;
  const rows = students.map(s => {
    const name = `"${s.last_name}, ${s.first_name}"`;
    const current = currentTeacherOf(s, period);
    return `${s.id},${name},${current ? emailById[current.id] ?? '' : ''}`;
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
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

function parseCSV(text, students, teachers, period) {
  const { teacherLabel } = PERIOD_CONFIG[period];
  const studentById = {};
  for (const s of students) studentById[String(s.id)] = s;

  const teacherByEmail = {};
  for (const t of teachers) {
    teacherByEmail[t.email.toLowerCase()] = t;
  }

  const lines = text.trim().split(/\r?\n/);
  const dataLines = lines[0].toLowerCase().startsWith('student_id') ? lines.slice(1) : lines;

  return dataLines
    .filter(line => line.trim() !== '')
    .map((line, idx) => {
      const csvRowNum = idx + 2;
      const parts = parseCSVLine(line);
      if (parts.length < 3) {
        return { csvRowNum, status: 'error', reason: 'Invalid row format (expected 3 columns)' };
      }
      const studentId = parts[0].trim();
      const email = parts[2].trim();

      if (!studentId) {
        return { csvRowNum, status: 'error', reason: 'Missing student ID' };
      }

      const student = studentById[studentId];
      if (!student) {
        return { csvRowNum, studentId, email, status: 'error_student_not_found', reason: `Student ID "${studentId}" not found` };
      }

      if (!email) {
        return { csvRowNum, studentId, student, status: 'error', reason: `Missing ${teacherLabel} email` };
      }

      const newTeacher = teacherByEmail[email.toLowerCase()];
      if (!newTeacher) {
        return { csvRowNum, studentId, student, email, status: 'error_teacher_not_found', reason: `No teacher found with email "${email}"` };
      }

      const current = currentTeacherOf(student, period);
      if (current && String(current.id) === String(newTeacher.id)) {
        return { csvRowNum, studentId, student, email, newTeacher, current, status: 'no_change' };
      }

      return { csvRowNum, studentId, student, email, newTeacher, current, status: 'ok' };
    });
}

const STATUS_CONFIG = {
  ok: { label: 'Will update', color: 'success' },
  no_change: { label: 'No change', color: 'default' },
  error_student_not_found: { label: 'Student not found', color: 'error' },
  error_teacher_not_found: { label: 'Email not found', color: 'error' },
  error: { label: 'Error', color: 'error' }
};

const BulkRRUpdate = ({ open, onClose, onComplete, students, teachers, period = 'RR' }) => {
  const config = PERIOD_CONFIG[period];
  const [step, setStep] = useState(1);
  const [parsedRows, setParsedRows] = useState([]);
  const [parseError, setParseError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const fileInputRef = useRef();

  const reset = () => {
    setStep(1);
    setParsedRows([]);
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
        const rows = parseCSV(evt.target.result, students, teachers, period);
        if (rows.length === 0) {
          setParseError('No data rows found in the CSV file.');
          return;
        }
        setParsedRows(rows);
        setStep(2);
      } catch (err) {
        setParseError('Failed to parse CSV file. Please check the format.');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirm = async () => {
    const updates = parsedRows
      .filter(r => r.status === 'ok')
      .map(r => ({ studentId: r.studentId, teacherId: r.newTeacher.id }));
    setSubmitting(true);
    setParseError('');
    try {
      const res = await apiService.bulkUpdateEnrollment(period, updates);
      setSubmitResult(res.data);
      setStep(3);
    } catch (err) {
      setParseError(err.response?.data?.msg || 'Failed to submit updates.');
    } finally {
      setSubmitting(false);
    }
  };

  const okRows = parsedRows.filter(r => r.status === 'ok');
  const noChangeRows = parsedRows.filter(r => r.status === 'no_change');
  const errorRows = parsedRows.filter(r => r.status.startsWith('error'));
  const previewRows = [...okRows, ...errorRows];

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>

      {/* Step 1 — Upload */}
      {step === 1 && (
        <>
          <DialogTitle>{config.title} — Step 1: Upload CSV</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Upload a CSV file with updated {config.describe}. The file must have three columns:
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, fontFamily: 'monospace', fontSize: '0.8rem', bgcolor: 'grey.50', whiteSpace: 'pre' }}>
              {`student_id,student_name,${config.column}\n123456789,"Doe, John",smith@school.edu\n987654321,"Smith, Jane",johnson@school.edu`}
            </Paper>
            <Typography variant="body2" sx={{ mb: 2 }}>
              <strong>Tip:</strong> Export the current assignments first, update the <code>{config.column}</code> email column in Google Sheets, then re-upload. The <code>student_name</code> column is ignored on upload.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={() => exportCSV(students, teachers, period)}
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
          <DialogTitle>{config.title} — Step 2: Review Changes</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Chip label={`${okRows.length} will update`} color="success" size="small" />
              <Chip label={`${noChangeRows.length} no change`} color="default" size="small" />
              {errorRows.length > 0 && (
                <Chip label={`${errorRows.length} error${errorRows.length !== 1 ? 's' : ''}`} color="error" size="small" />
              )}
            </Box>
            {previewRows.length === 0 ? (
              <Alert severity="info">All rows are unchanged — nothing to update.</Alert>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Student</strong></TableCell>
                      <TableCell><strong>Current {config.teacherLabel}</strong></TableCell>
                      <TableCell><strong>New {config.teacherLabel}</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewRows.map((row, i) => {
                      const cfg = STATUS_CONFIG[row.status] || { label: row.status, color: 'default' };
                      return (
                        <TableRow key={i}>
                          <TableCell>
                            {row.student
                              ? `${row.student.first_name} ${row.student.last_name}`
                              : row.studentId}
                          </TableCell>
                          <TableCell>{row.current?.last_name ?? '—'}</TableCell>
                          <TableCell>{row.newTeacher?.last_name ?? row.email ?? '—'}</TableCell>
                          <TableCell>
                            <Chip label={cfg.label} color={cfg.color} size="small" />
                            {row.reason && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                Row {row.csvRowNum}: {row.reason}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
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
              disabled={okRows.length === 0 || submitting}
              startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
            >
              {submitting ? 'Updating…' : `Confirm (${okRows.length} update${okRows.length !== 1 ? 's' : ''})`}
            </Button>
          </DialogActions>
        </>
      )}

      {/* Step 3 — Results */}
      {step === 3 && submitResult && (
        <>
          <DialogTitle>{config.title} — Done</DialogTitle>
          <DialogContent>
            <Alert
              severity={submitResult.failed.length === 0 ? 'success' : 'warning'}
              sx={{ mb: submitResult.failed.length > 0 ? 2 : 0 }}
            >
              {submitResult.succeeded.length} assignment{submitResult.succeeded.length !== 1 ? 's' : ''} updated
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
