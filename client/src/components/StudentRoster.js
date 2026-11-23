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
  CircularProgress,
  Chip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import UpdateIcon from '@mui/icons-material/Update';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import apiService from '../utils/apiService';
import BulkRRUpdate from './BulkRRUpdate';
import BulkStudentImport from './BulkStudentImport';

const ROTATIONS = ['R1', 'R2', 'RR', 'R4', 'R5'];

const extraEnrollmentsOf = (student) =>
  (student.enrollments || []).filter(e => !ROTATIONS.includes(e.period));

const emptyEditState = { R1Id: null, R2Id: null, RRId: null, R4Id: null, R5Id: null };
const emptyAddState = { id: '', first_name: '', last_name: '', email: '', R1: null, R2: null, RR: null, R4: null, R5: null };

const StudentRoster = () => {
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [editFields, setEditFields] = useState(emptyEditState);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Additional (non-rotation) classes, e.g. an online class - within the edit dialog
  const [editExtraEnrollments, setEditExtraEnrollments] = useState([]);
  const [originalExtraPeriods, setOriginalExtraPeriods] = useState([]);
  const [newClassPeriod, setNewClassPeriod] = useState('');
  const [newClassTeacherId, setNewClassTeacherId] = useState('');

  // Bulk RR dialog state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [caseloadBulkOpen, setCaseloadBulkOpen] = useState(false);

  // Bulk student import dialog state
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addFields, setAddFields] = useState(emptyAddState);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [studentsRes, teachersRes] = await Promise.all([
        apiService.getStudents(),
        apiService.getTeachers()
      ]);
      setStudents(studentsRes.data);
      setTeachers(teachersRes.data);
    } catch (e) {
      setError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getLastName = (teacherObj) => teacherObj?.last_name ?? '—';

  const filteredStudents = students.filter(s => {
    const full = `${s.first_name} ${s.last_name}`.toLowerCase();
    return full.includes(search.toLowerCase());
  });

  // --- Edit handlers ---
  const openEdit = (student) => {
    setEditStudent(student);
    setEditFields({
      R1Id: student.R1?.id ?? null,
      R2Id: student.R2?.id ?? null,
      RRId: student.RR?.id ?? null,
      R4Id: student.R4?.id ?? null,
      R5Id: student.R5?.id ?? null
    });
    const extra = extraEnrollmentsOf(student).map(e => ({ period: e.period, teacherId: e.teacher.id }));
    setEditExtraEnrollments(extra);
    setOriginalExtraPeriods(extra.map(e => e.period));
    setNewClassPeriod('');
    setNewClassTeacherId('');
    setEditError('');
    setEditOpen(true);
  };

  const handleAddClass = () => {
    if (!newClassPeriod.trim()) {
      setEditError('Class name is required.');
      return;
    }
    if (!newClassTeacherId) {
      setEditError('Select a teacher for the new class.');
      return;
    }
    if (ROTATIONS.includes(newClassPeriod.trim()) || editExtraEnrollments.some(e => e.period === newClassPeriod.trim())) {
      setEditError(`"${newClassPeriod.trim()}" is already assigned - remove it first to change the teacher.`);
      return;
    }
    setEditExtraEnrollments(prev => [...prev, { period: newClassPeriod.trim(), teacherId: newClassTeacherId }]);
    setNewClassPeriod('');
    setNewClassTeacherId('');
    setEditError('');
  };

  const handleRemoveClass = (period) => {
    setEditExtraEnrollments(prev => prev.filter(e => e.period !== period));
  };

  const handleEditSave = async () => {
    setEditSaving(true);
    setEditError('');
    try {
      const removedPeriods = originalExtraPeriods.filter(
        p => !editExtraEnrollments.some(e => e.period === p)
      );
      const enrollments = [
        ...editExtraEnrollments,
        ...removedPeriods.map(period => ({ period, teacherId: null }))
      ];
      await apiService.updateStudent(editStudent.id, { ...editFields, enrollments });
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
    if (!addFields.email.trim()) {
      setAddError('Email is required.');
      return;
    }
    setAddSaving(true);
    setAddError('');
    try {
      await apiService.createStudent({
        id: Number(addFields.id),
        first_name: addFields.first_name.trim(),
        last_name: addFields.last_name.trim(),
        email: addFields.email.trim(),
        teachers: {
          R1: addFields.R1,
          R2: addFields.R2,
          RR: addFields.RR,
          R4: addFields.R4,
          R5: addFields.R5
        }
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
            Bulk RR Update
          </Button>
          <Button
            variant="outlined"
            startIcon={<UpdateIcon />}
            onClick={() => setCaseloadBulkOpen(true)}
          >
            Bulk Caseload Update
          </Button>
          <Button
            variant="outlined"
            startIcon={<GroupAddIcon />}
            onClick={() => setBulkImportOpen(true)}
          >
            Bulk Import Students
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
              {ROTATIONS.map(r => (
                <TableCell key={r} align="center"><strong>{r}</strong></TableCell>
              ))}
              <TableCell><strong>Other Classes</strong></TableCell>
              <TableCell align="center"><strong>Edit</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredStudents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">No students found.</TableCell>
              </TableRow>
            ) : (
              filteredStudents.map(student => (
                <TableRow key={student.id} hover>
                  <TableCell>{student.first_name} {student.last_name}</TableCell>
                  <TableCell align="center">{getLastName(student.R1)}</TableCell>
                  <TableCell align="center">{getLastName(student.R2)}</TableCell>
                  <TableCell align="center">{getLastName(student.RR)}</TableCell>
                  <TableCell align="center">{getLastName(student.R4)}</TableCell>
                  <TableCell align="center">{getLastName(student.R5)}</TableCell>
                  <TableCell>
                    {extraEnrollmentsOf(student).map(e => (
                      <Chip
                        key={e.period}
                        label={`${e.period}: ${e.teacher?.last_name ?? '—'}`}
                        size="small"
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
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
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Edit — {editStudent?.first_name} {editStudent?.last_name}
        </DialogTitle>
        <DialogContent>
          {editError && <Alert severity="error" sx={{ mb: 2 }}>{editError}</Alert>}
          {ROTATIONS.map(rotation => {
            const fieldKey = rotation === 'RR' ? 'RRId' : `${rotation}Id`;
            return (
              <FormControl fullWidth margin="dense" key={rotation}>
                <InputLabel>{rotation} Teacher</InputLabel>
                <Select
                  label={`${rotation} Teacher`}
                  value={editFields[fieldKey] ?? ''}
                  onChange={e => setEditFields(prev => ({
                    ...prev,
                    [fieldKey]: e.target.value === '' ? null : e.target.value
                  }))}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {teachers.map(t => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.first_name} {t.last_name} — {t.subject}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            );
          })}

          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
            Additional Classes
          </Typography>
          {editExtraEnrollments.map(e => {
            const teacher = teachers.find(t => t.id === e.teacherId);
            return (
              <Box key={e.period} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Chip label={`${e.period}: ${teacher ? `${teacher.first_name} ${teacher.last_name}` : e.teacherId}`} sx={{ flexGrow: 1, justifyContent: 'flex-start' }} />
                <IconButton size="small" color="error" onClick={() => handleRemoveClass(e.period)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            );
          })}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
            <TextField
              label="Class name"
              size="small"
              placeholder="e.g. Online-CS"
              value={newClassPeriod}
              onChange={e => setNewClassPeriod(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Teacher</InputLabel>
              <Select
                label="Teacher"
                value={newClassTeacherId}
                onChange={e => setNewClassTeacherId(e.target.value)}
              >
                {teachers.map(t => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.first_name} {t.last_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton color="primary" onClick={handleAddClass}>
              <AddIcon />
            </IconButton>
          </Box>
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

      {/* Bulk RR Update Dialog */}
      <BulkRRUpdate
        period="RR"
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onComplete={fetchData}
        students={students}
        teachers={teachers}
      />

      {/* Bulk SPED caseload (case manager) Dialog */}
      <BulkRRUpdate
        period="SPED"
        open={caseloadBulkOpen}
        onClose={() => setCaseloadBulkOpen(false)}
        onComplete={fetchData}
        students={students}
        teachers={teachers}
      />

      {/* Bulk Student Import Dialog */}
      <BulkStudentImport
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onComplete={fetchData}
        students={students}
        teachers={teachers}
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
          <TextField
            label="Email"
            type="email"
            fullWidth
            margin="dense"
            value={addFields.email}
            onChange={e => setAddFields(prev => ({ ...prev, email: e.target.value }))}
          />
          {ROTATIONS.map(rotation => (
            <FormControl fullWidth margin="dense" key={rotation}>
              <InputLabel>{rotation} Teacher</InputLabel>
              <Select
                label={`${rotation} Teacher`}
                value={addFields[rotation] ?? ''}
                onChange={e => setAddFields(prev => ({
                  ...prev,
                  [rotation]: e.target.value === '' ? null : e.target.value
                }))}
              >
                <MenuItem value=""><em>None</em></MenuItem>
                {teachers.map(t => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.first_name} {t.last_name} — {t.subject}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ))}
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
