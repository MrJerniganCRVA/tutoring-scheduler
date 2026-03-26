import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Button,
    Alert,
    CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import GoogleIcon from '@mui/icons-material/Google';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
const DEV_AUTH = process.env.REACT_APP_DEV_AUTH === 'true';

const Login = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const authError = urlParams.get('error');
        if (authError === 'auth_failed') {
            setError('Authentication failed. Please make sure you are logging in with your school email.');
        }

        // Check if already authenticated
        const checkAuth = async () => {
            try {
                const response = await fetch(`${API_URL}/auth/current`, {
                    credentials: 'include'
                });
                if (response.ok) {
                    const teacher = await response.json();
                    localStorage.setItem('teacherId', teacher.id);
                    localStorage.setItem('teacherName', `${teacher.firstName} ${teacher.lastName}`);
                    localStorage.setItem('isAdmin', teacher.isAdmin ? 'true' : 'false');
                    navigate('/dashboard');
                } else {
                    setLoading(false);
                }
            } catch (err) {
                console.error('Auth check failed', err);
                setLoading(false);
            }
        };

        checkAuth();
    }, [navigate]);

    const handleGoogleLogin = () => {
        window.location.href = `${API_URL}/auth/google`;
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', minHeight: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{
            minHeight: '60vh',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#f5f5f5'
        }}>
            <Paper elevation={3} sx={{ p: 3, width: '85%', maxWidth: 380, textAlign: 'center' }}>
                <Typography variant="h4" component="h1" gutterBottom>
                    Tutoring Scheduler
                </Typography>

                {DEV_AUTH ? (
                    <>
                        <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
                            <strong>Dev mode</strong> — Google OAuth is disabled. No credentials required.
                        </Alert>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Select your teacher account on the next screen.
                        </Typography>
                        <Button
                            variant="contained"
                            color="warning"
                            fullWidth
                            size="large"
                            onClick={() => navigate('/select-teacher')}
                            sx={{ py: 1.2, textTransform: 'none', fontSize: '16px' }}
                        >
                            Continue (Dev Mode)
                        </Button>
                    </>
                ) : (
                    <>
                        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                            Sign in with your school Google account to continue.
                        </Typography>
                        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                        <Button
                            variant="contained"
                            color="primary"
                            fullWidth
                            size="large"
                            startIcon={<GoogleIcon />}
                            onClick={handleGoogleLogin}
                            sx={{
                                py: 1.2,
                                textTransform: 'none',
                                fontSize: '16px',
                                '&:hover': { backgroundColor: '#79c1f1', color: '#222222' }
                            }}
                        >
                            Sign In With Google
                        </Button>
                    </>
                )}
            </Paper>
        </Box>
    );
};

export default Login;
