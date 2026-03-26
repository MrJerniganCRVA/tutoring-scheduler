import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import UpdateIcon from '@mui/icons-material/Update';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import apiService from '../utils/apiService';
import BulkRRUpdate from './BulkRRUpdate';

const emptyAddState = { id: '', first_name: '', last_name: '' };

const StudentRoster = () => {
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [editAssignments, setEditAssignments] = useState([]); // [{periodId, teacherId}]
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Bulk import dialog state
  const [bulkOpen, setBulkOpen] = useState(false);

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addFields, setAddFields] = useState(emptyAddState);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [studentsRes, teachersRes, periodsRes] = await Promise.all([
        apiService.getStudents(),
        apiService.getTeachers(),
        apiService.getPeriods()
      ]);
      setStudents(studentsRes.data);
      setTeachers(teachersRes.data);
      setPeriods(periodsRes.data);
    } catch (e) {
      setError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredStudents = students.filter(s => {
    const full = `${s.first_name} ${s.last_name}`.toLowerCase();
    return full.includes(search.toLowerCase());
  });

  // Format a student's period assignments as a compact string
  const formatAssignments = (student) => {
    const assignments = student.StudentPeriodAssignments || [];
    if (assignments.length === 0) return '—';
    return assignments
      .slice()
      .sort((a, b) => (a.Period?.order ?? 0) - (b.Period?.order ?? 0))
      .map(a => `${a.Period?.name ?? '?'}: ${a.Teacher?.last_name ?? '?'}`)
      .join(' | ');
  };

  // --- Edit handlers ---
  const openEdit = (student) => {
    setEditStudent(student);
    setEditAssignments(
      (student.StudentPeriodAssignments || [])
        .slice()
        .sort((a, b) => (a.Period?.order ?? 0) - (b.Period?.order ?? 0))
        .map(a => ({ periodId: a.PeriodId, teacherId: a.TeacherId }))
    );
    setEditError('');
    setEditOpen(true);
  };

  const handleAssignmentChange = (index, field, value) => {
    setEditAssignments(prev =>
      prev.map((row, i) => i === index ? { ...row, [field]: value === '' ? null : Number(value) } : row)
    );
  };

  const addAssignmentRow = () => {
    setEditAssignments(prev => [...prev, { periodId: null, teacherId: null }]);
  };

  const removeAssignmentRow = (index) => {
    setEditAssignments(prev => prev.filter((_, i) => i !== index));
  };

  const handleEditSave = async () => {
    // Validate: no duplicate periods
    const periodIds = editAssignments.filter(a => a.periodId).map(a => a.periodId);
    if (new Set(periodIds).size !== periodIds.length) {
      setEditError('A student cannot have the same period assigned twice.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      await apiService.updateStudentPeriods(
        editStudent.id,
        editAssignments.filter(a => a.periodId && a.teacherId)
      );
      setEditOpen(false);
      await fetchData();
    } catch (e) {
      setEditError(e.response?.data?.msg || 'Failed to save changes.');
    } finally {
      setEditSaving(false);
    }
  };

  // --- Add handlers ---
  const openAdd = () => {
    setAddFields(emptyAddState);
    setAddError('');
    setAddOpen(true);
  };

  const handleAddSave = async () => {
    if (!addFields.id || !String(addFields.id).trim()) {
      setAddError('Student ID is required.');
      return;
    }
    if (!addFields.first_name.trim() || !addFields.last_name.trim()) {
      setAddError('First and last name are required.');
      return;
    }
    setAddSaving(true);
    setAddError('');
    try {
      await apiService.createStudent({
        id: Number(addFields.id),
        first_name: addFields.first_name.trim(),
        last_name: addFields.last_name.trim()
      });
      setAddOpen(false);
      await fetchData();
    } catch (e) {
      setAddError(e.response?.data?.msg || 'Failed to add student.');
    } finally {
      setAddSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Student Roster</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<UpdateIcon />}
            onClick={() => setBulkOpen(true)}
          >
            Bulk Import
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PersonAddIcon />}
            onClick={openAdd}
          >
            Add Student
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TextField
        label="Search students"
        variant="outlined"
        size="small"
        value={search}
        onChange={e => setSearch(e.target.value)}
        sx={{ mb: 2, width: 280 }}
      />

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell><strong>Student</strong></TableCell>
              <TableCell><strong>Period Assignments</strong></TableCell>
              <TableCell align="center"><strong>Edit</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredStudents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center">No students found.</TableCell>
              </TableRow>
            ) : (
              filteredStudents.map(student => (
                <TableRow key={student.id} hover>
                  <TableCell>{student.first_name} {student.last_name}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                    {formatAssignments(student)}
                  </TableCell>
                  <TableCell align="center">
                    <IconButton size="small" color="primary" onClick={() => openEdit(student)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Edit — {editStudent?.first_name} {editStudent?.last_name}
        </DialogTitle>
        <DialogContent>
          {editError && <Alert severity="error" sx={{ mb: 2 }}>{editError}</Alert>}
          <Typography variant="subtitle2" sx={{ mb: 1.5, mt: 0.5 }}>
            Period Assignments
          </Typography>
          {editAssignments.map((row, index) => (
            <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Period</InputLabel>
                <Select
                  label="Period"
                  value={row.periodId ?? ''}
                  onChange={e => handleAssignmentChange(index, 'periodId', e.target.value)}
                >
                  <MenuItem value=""><em>Select period</em></MenuItem>
                  {periods.map(p => (
                    <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 2 }}>
                <InputLabel>Teacher</InputLabel>
                <Select
                  label="Teacher"
                  value={row.teacherId ?? ''}
                  onChange={e => handleAssignmentChange(index, 'teacherId', e.target.value)}
                >
                  <MenuItem value=""><em>Select teacher</em></MenuItem>
                  {teachers.map(t => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.first_name} {t.last_name}{t.subject ? ` — ${t.subject}` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <IconButton size="small" color="error" onClick={() => removeAssignmentRow(index)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={addAssignmentRow}
            sx={{ mt: 0.5 }}
          >
            Add period
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleEditSave}
            disabled={editSaving}
          >
            {editSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Import Dialog */}
      <BulkRRUpdate
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onComplete={fetchData}
        students={students}
        teachers={teachers}
        periods={periods}
      />

      {/* Add Student Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Student</DialogTitle>
        <DialogContent>
          {addError && <Alert severity="error" sx={{ mb: 2 }}>{addError}</Alert>}
          <TextField
            label="Student ID"
            fullWidth
            margin="dense"
            value={addFields.id}
            onChange={e => setAddFields(prev => ({ ...prev, id: e.target.value }))}
            inputProps={{ inputMode: 'numeric' }}
          />
          <TextField
            label="First Name"
            fullWidth
            margin="dense"
            value={addFields.first_name}
            onChange={e => setAddFields(prev => ({ ...prev, first_name: e.target.value }))}
          />
          <TextField
            label="Last Name"
            fullWidth
            margin="dense"
            value={addFields.last_name}
            onChange={e => setAddFields(prev => ({ ...prev, last_name: e.target.value }))}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Period assignments can be set after adding the student.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)} disabled={addSaving}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleAddSave}
            disabled={addSaving}
          >
            {addSaving ? 'Saving…' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StudentRoster;
