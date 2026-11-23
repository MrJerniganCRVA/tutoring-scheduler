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

const ROTATIONS = ['R1', 'R2', 'RR', 'R4', 'R5'];
const CSV_HEADER = 'student_id,first_name,last_name,email,r1_teacher,r2_teacher,rr_teacher,r4_teacher,r5_teacher';

function downloadTemplate() {
  const example = '24000001,Jane,Doe,jane.doe@students.school.edu,smith@school.edu,johnson@school.edu,smith@school.edu,williams@school.edu,locke@school.edu';
  const csv = [CSV_HEADER, example].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'student_import_template.csv';
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

function parseCSV(text, existingStudents, teachers) {
  const existingIds = new Set(existingStudents.map(s => String(s.id)));
  const teacherByEmail = {};
  for (const t of teachers) teacherByEmail[t.email.toLowerCase()] = t;

  const lines = text.trim().split(/\r?\n/);
  const dataLines = lines[0].toLowerCase().startsWith('student_id') ? lines.slice(1) : lines;

  const seenIds = new Set();

  return dataLines
    .filter(line => line.trim() !== '')
    .map((line, idx) => {
      const csvRowNum = idx + 2;
      const parts = parseCSVLine(line);
      if (parts.length < 9) {
        return { csvRowNum, studentId: parts[0]?.trim() || undefined, status: 'error', reason: 'Invalid row format (expected 9 columns)' };
      }
      const [studentId, first_name, last_name, email, r1Email, r2Email, rrEmail, r4Email, r5Email] =
        parts.map(p => p.trim());

      if (!studentId || !/^\d+$/.test(studentId)) {
        return { csvRowNum, studentId, first_name, last_name, email, status: 'error', reason: 'Student ID must be a number' };
      }
      if (seenIds.has(studentId)) {
        return { csvRowNum, studentId, first_name, last_name, email, status: 'error', reason: `Duplicate student ID "${studentId}" earlier in this file` };
      }
      seenIds.add(studentId);

      if (existingIds.has(studentId)) {
        return { csvRowNum, studentId, first_name, last_name, email, status: 'error', reason: `Student ID "${studentId}" already exists` };
      }
      if (!first_name || !last_name) {
        return { csvRowNum, studentId, first_name, last_name, email, status: 'error', reason: 'Missing first or last name' };
      }
      if (!email) {
        return { csvRowNum, studentId, first_name, last_name, email, status: 'error', reason: 'Missing email' };
      }

      const rotationEmails = { R1: r1Email, R2: r2Email, RR: rrEmail, R4: r4Email, R5: r5Email };
      const rotationTeachers = {};
      for (const rotation of ROTATIONS) {
        const rEmail = rotationEmails[rotation];
        if (!rEmail) { rotationTeachers[rotation] = null; continue; }
        const teacher = teacherByEmail[rEmail.toLowerCase()];
        if (!teacher) {
          return { csvRowNum, studentId, first_name, last_name, email, status: 'error_teacher_not_found', reason: `${rotation}: no teacher found with email "${rEmail}"` };
        }
        rotationTeachers[rotation] = teacher;
      }

      return {
        csvRowNum, studentId, first_name, last_name, email,
        ...rotationTeachers,
        status: 'ok'
      };
    });
}

const STATUS_CONFIG = {
  ok: { label: 'Will create', color: 'success' },
  error_teacher_not_found: { label: 'Teacher not found', color: 'error' },
  error: { label: 'Error', color: 'error' }
};

const BulkStudentImport = ({ open, onClose, onComplete, students, teachers }) => {
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
        const rows = parseCSV(evt.target.result, students, teachers);
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
    const newStudents = parsedRows
      .filter(r => r.status === 'ok')
      .map(r => ({
        id: Number(r.studentId),
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        R1Id: r.R1?.id ?? null,
        R2Id: r.R2?.id ?? null,
        RRId: r.RR?.id ?? null,
        R4Id: r.R4?.id ?? null,
        R5Id: r.R5?.id ?? null
      }));
    setSubmitting(true);
    setParseError('');
    try {
      const res = await apiService.bulkCreateStudents(newStudents);
      setSubmitResult(res.data);
      setStep(3);
    } catch (err) {
      setParseError(err.response?.data?.msg || 'Failed to submit import.');
    } finally {
      setSubmitting(false);
    }
  };

  const okRows = parsedRows.filter(r => r.status === 'ok');
  const errorRows = parsedRows.filter(r => r.status.startsWith('error'));

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>

      {/* Step 1 — Upload */}
      {step === 1 && (
        <>
          <DialogTitle>Bulk Import Students — Step 1: Upload CSV</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Upload a CSV file to create new students. The file must have nine columns:
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, fontFamily: 'monospace', fontSize: '0.8rem', bgcolor: 'grey.50', whiteSpace: 'pre', overflowX: 'auto' }}>
              {CSV_HEADER + '\n24000001,Jane,Doe,jane.doe@students.school.edu,smith@school.edu,johnson@school.edu,smith@school.edu,williams@school.edu,locke@school.edu'}
            </Paper>
            <Typography variant="body2" sx={{ mb: 2 }}>
              <strong>Tip:</strong> The five rotation columns (r1_teacher through r5_teacher) take a teacher's email
              and can be left blank to leave that slot unassigned. Rows with a student ID that already exists are
              skipped as errors — use the roster's edit or Bulk RR Update instead for existing students.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={downloadTemplate}
              >
                Download CSV template
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
          <DialogTitle>Bulk Import Students — Step 2: Review</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Chip label={`${okRows.length} will create`} color="success" size="small" />
              {errorRows.length > 0 && (
                <Chip label={`${errorRows.length} error${errorRows.length !== 1 ? 's' : ''}`} color="error" size="small" />
              )}
            </Box>
            {parsedRows.length === 0 ? (
              <Alert severity="info">No rows to import.</Alert>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360, overflowX: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>ID</strong></TableCell>
                      <TableCell><strong>Student</strong></TableCell>
                      <TableCell><strong>Email</strong></TableCell>
                      {ROTATIONS.map(r => (
                        <TableCell key={r} align="center"><strong>{r}</strong></TableCell>
                      ))}
                      <TableCell><strong>Status</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {parsedRows.map((row, i) => {
                      const cfg = STATUS_CONFIG[row.status] || { label: row.status, color: 'default' };
                      return (
                        <TableRow key={i}>
                          <TableCell>{row.studentId ?? '—'}</TableCell>
                          <TableCell>
                            {row.first_name ? `${row.first_name} ${row.last_name}` : '—'}
                          </TableCell>
                          <TableCell>{row.email ?? '—'}</TableCell>
                          {ROTATIONS.map(r => (
                            <TableCell key={r} align="center">{row[r]?.last_name ?? '—'}</TableCell>
                          ))}
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
              {submitting ? 'Importing…' : `Confirm (${okRows.length} create${okRows.length !== 1 ? 's' : ''})`}
            </Button>
          </DialogActions>
        </>
      )}

      {/* Step 3 — Results */}
      {step === 3 && submitResult && (
        <>
          <DialogTitle>Bulk Import Students — Done</DialogTitle>
          <DialogContent>
            <Alert
              severity={submitResult.failed.length === 0 ? 'success' : 'warning'}
              sx={{ mb: submitResult.failed.length > 0 ? 2 : 0 }}
            >
              {submitResult.succeeded.length} student{submitResult.succeeded.length !== 1 ? 's' : ''} created
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

export default BulkStudentImport;
