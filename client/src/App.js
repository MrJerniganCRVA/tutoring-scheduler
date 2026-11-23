import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Box, Container, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import Login from './components/Login';
import RaptorRotation from './components/RaptorRotation';
import TeacherDashboard from './components/TeacherDashboard';
import Header from './components/Header';
import Scheduling from './components/Scheduling';
import TutoringEvents from './components/TutoringEvents';
import RosterPage from './components/RosterPage';
import AdminDashboard from './components/AdminDashboard';
import CaseloadPage from './components/CaseloadPage';
import {TutoringProvider } from './contexts/TutoringContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Footer from './components/Footer';

const AdminRoute = ({ children }) => {
  const { currentUser, authLoading } = useAuth();
  if (authLoading) return null;
  return currentUser?.isAdmin ? children : <Navigate to="/dashboard" replace />;
};

// Case managers (teachers with SPED caseload students) only. The server scopes
// /api/caseload to the caller regardless; this just keeps the page tidy.
const CaseloadRoute = ({ children }) => {
  const { currentUser, authLoading } = useAuth();
  if (authLoading) return null;
  return currentUser?.hasCaseload ? children : <Navigate to="/dashboard" replace />;
};

// Create a theme instance
const theme = createTheme({
  palette: {
    primary: {
      main: '#ec3a8f',
    },
    secondary: {
      main: '#8fc644',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 500,
    },
  },
});

function App() {
  return (
    <AuthProvider>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh'
        }}>
        <Header />

        <Container maxWidth="lg" sx={{ mt: 4, mb: 4, minHeight:'65vh', flex: 1}}>
        <TutoringProvider>
          <Routes>
            <Route path="/select-teacher" element={<Login />} />
            <Route path="/dashboard" element={<RaptorRotation />} />
            <Route path="/tutoring" element={<Scheduling />} />
            <Route path="/calendar" element={<TutoringEvents />} />
            <Route path="/analytics" element={<TeacherDashboard />} />
            <Route path="/roster" element={<AdminRoute><RosterPage /></AdminRoute>} />
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/caseload" element={<CaseloadRoute><CaseloadPage /></CaseloadRoute>} />
            <Route path="/" element={<Navigate to="/select-teacher" replace />} />
            <Route path="*" element={<div>Page Not Found</div>} />
          </Routes>
          </TutoringProvider>
        </Container>
       <Footer />
       </Box>
      </Router>
    </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
