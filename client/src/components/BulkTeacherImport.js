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

const CSV_HEADER = 'teacher_id,first_name,last_name,email,subject,lunch';
const LUNCHES = ['A', 'B', 'C', 'D'];

function downloadTemplate() {
  const example = '10020,Jamie,Rivera,jamie.rivera@coderva.org,Math,B';
  const csv = [CSV_HEADER, example].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'teacher_import_template.csv';
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

function parseCSV(text, existingTeachers) {
  const existingIds = new Set(existingTeachers.map(t => String(t.id)));
  const existingEmails = new Set(existingTeachers.map(t => t.email.toLowerCase()));

  const lines = text.trim().split(/\r?\n/);
  const dataLines = lines[0].toLowerCase().startsWith('teacher_id') ? lines.slice(1) : lines;

  const seenIds = new Set();
  const seenEmails = new Set();

  return dataLines
    .filter(line => line.trim() !== '')
    .map((line, idx) => {
      const csvRowNum = idx + 2;
      const parts = parseCSVLine(line);
      if (parts.length < 5) {
        return { csvRowNum, status: 'error', reason: 'Invalid row format (expected at least 5 columns)' };
      }
      const [teacherId, first_name, last_name, email, subject, lunch = ''] = parts.map(p => p.trim());

      if (!teacherId || !/^\d+$/.test(teacherId)) {
        return { csvRowNum, teacherId, status: 'error', reason: 'Teacher ID must be a number' };
      }
      if (seenIds.has(teacherId)) {
        return { csvRowNum, teacherId, status: 'error', reason: `Duplicate teacher ID "${teacherId}" earlier in this file` };
      }
      seenIds.add(teacherId);

      if (existingIds.has(teacherId)) {
        return { csvRowNum, teacherId, status: 'error', reason: `Teacher ID "${teacherId}" already exists` };
      }
      if (!first_name || !last_name) {
        return { csvRowNum, teacherId, status: 'error', reason: 'Missing first or last name' };
      }
      if (!email) {
        return { csvRowNum, teacherId, status: 'error', reason: 'Missing email' };
      }
      const emailLower = email.toLowerCase();
      if (seenEmails.has(emailLower)) {
        return { csvRowNum, teacherId, email, status: 'error', reason: `Duplicate email "${email}" earlier in this file` };
      }
      seenEmails.add(emailLower);
      if (existingEmails.has(emailLower)) {
        return { csvRowNum, teacherId, email, status: 'error', reason: `A teacher with email "${email}" already exists` };
      }
      if (!subject) {
        return { csvRowNum, teacherId, email, status: 'error', reason: 'Missing subject' };
      }
      if (lunch && !LUNCHES.includes(lunch.toUpperCase())) {
        return { csvRowNum, teacherId, email, status: 'error', reason: `Lunch must be one of ${LUNCHES.join(', ')} (or blank)` };
      }

      return {
        csvRowNum, teacherId, first_name, last_name, email, subject,
        lunch: lunch ? lunch.toUpperCase() : null,
        status: 'ok'
      };
    });
}

const STATUS_CONFIG = {
  ok: { label: 'Will create', color: 'success' },
  error: { label: 'Error', color: 'error' }
};

const BulkTeacherImport = ({ open, onClose, onComplete, teachers }) => {
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
        const rows = parseCSV(evt.target.result, teachers);
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
    const newTeachers = parsedRows
      .filter(r => r.status === 'ok')
      .map(r => ({
        id: Number(r.teacherId),
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        subject: r.subject,
        lunch: r.lunch
      }));
    setSubmitting(true);
    setParseError('');
    try {
      const res = await apiService.bulkCreateTeachers(newTeachers);
      setSubmitResult(res.data);
      setStep(3);
    } catch (err) {
      setParseError(err.response?.data?.msg || 'Failed to submit import.');
    } finally {
      setSubmitting(false);
    }
  };

  const okRows = parsedRows.filter(r => r.status === 'ok');
  const errorRows = parsedRows.filter(r => r.status === 'error');

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>

      {/* Step 1 — Upload */}
      {step === 1 && (
        <>
          <DialogTitle>Bulk Import Teachers — Step 1: Upload CSV</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Upload a CSV file to create new teachers. The file must have these columns:
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, fontFamily: 'monospace', fontSize: '0.8rem', bgcolor: 'grey.50', whiteSpace: 'pre', overflowX: 'auto' }}>
              {CSV_HEADER + '\n10020,Jamie,Rivera,jamie.rivera@coderva.org,Math,B'}
            </Paper>
            <Typography variant="body2" sx={{ mb: 2 }}>
              <strong>Tip:</strong> <code>lunch</code> is optional (one of A/B/C/D) and can be left blank.
              Rows with a teacher ID or email that already exists are skipped as errors — use the roster's edit
              instead for existing teachers.
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
          <DialogTitle>Bulk Import Teachers — Step 2: Review</DialogTitle>
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
                      <TableCell><strong>Teacher</strong></TableCell>
                      <TableCell><strong>Email</strong></TableCell>
                      <TableCell><strong>Subject</strong></TableCell>
                      <TableCell align="center"><strong>Lunch</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {parsedRows.map((row, i) => {
                      const cfg = STATUS_CONFIG[row.status] || { label: row.status, color: 'default' };
                      return (
                        <TableRow key={i}>
                          <TableCell>{row.teacherId ?? '—'}</TableCell>
                          <TableCell>
                            {row.first_name ? `${row.first_name} ${row.last_name}` : '—'}
                          </TableCell>
                          <TableCell>{row.email ?? '—'}</TableCell>
                          <TableCell>{row.subject ?? '—'}</TableCell>
                          <TableCell align="center">{row.lunch ?? '—'}</TableCell>
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
          <DialogTitle>Bulk Import Teachers — Done</DialogTitle>
          <DialogContent>
            <Alert
              severity={submitResult.failed.length === 0 ? 'success' : 'warning'}
              sx={{ mb: submitResult.failed.length > 0 ? 2 : 0 }}
            >
              {submitResult.succeeded.length} teacher{submitResult.succeeded.length !== 1 ? 's' : ''} created
              {submitResult.failed.length > 0 && ` · ${submitResult.failed.length} failed`}
            </Alert>
            {submitResult.failed.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Failures:</Typography>
                {submitResult.failed.map((f, i) => (
                  <Typography key={i} variant="body2" color="error">
                    Teacher ID {f.teacherId}: {f.reason}
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

export default BulkTeacherImport;
