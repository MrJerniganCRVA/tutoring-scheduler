import React, { useState, useEffect, useCallback } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Tabs,
  Tab,
  Badge,
  IconButton,
  Menu,
  MenuItem,
  ListItemText,
  Divider,
  Tooltip
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import SchoolIcon from '@mui/icons-material/School';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useAuth } from '../contexts/AuthContext';
import apiService from '../utils/apiService';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, clearUser } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellAnchor, setBellAnchor] = useState(null);

  const teacherName = currentUser
    ? `${currentUser.firstName} ${currentUser.lastName}`
    : localStorage.getItem('teacherName');
  const isAdmin = currentUser?.isAdmin ?? false;
  // Case managers (SPED caseload) get the Caseload tab.
  const hasCaseload = currentUser?.hasCaseload ?? false;
  const isLoggedIn = !!(currentUser || localStorage.getItem('teacherId'));

  const handleLogout = async () => {
    try{
      await fetch(`${API_URL}/auth/logout`, {
        credentials: 'include',
        method: 'GET'
      });
    } catch (err){
      console.error("Logout failed", err);
    } finally {
      clearUser();
      navigate('/select-teacher');
    }
  };

  // Notifications are currently only written when a teacher is overridden on a
  // priority day, so there is nothing to poll for - fetch once on login and
  // again whenever the bell is opened.
  const loadNotifications = useCallback(async () => {
    try {
      const response = await apiService.getNotifications();
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
    } catch (err) {
      // A teacher who can't load their notifications should still get a working
      // nav bar, so this stays a console warning rather than a visible error.
      console.error('Failed to load notifications', err);
    }
  }, []);

  useEffect(() => {
    if (currentUser) loadNotifications();
  }, [currentUser, loadNotifications]);

  const handleBellOpen = (event) => {
    setBellAnchor(event.currentTarget);
    loadNotifications();
  };

  const handleNotificationClick = async (notification) => {
    if (notification.read) return;
    try {
      await apiService.markNotificationRead(notification.id);
      setNotifications(prev =>
        prev.map(n => (n.id === notification.id ? { ...n, read: true } : n)));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiService.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read', err);
    }
  };

  const getTabValue = () => {
    if (location.pathname === '/dashboard') return 0;
    if (location.pathname === '/tutoring') return 1;
    if (location.pathname === '/calendar') return 2;
    if (location.pathname === '/analytics') return 3;
    if (location.pathname === '/roster') return 4;
    if (location.pathname === '/admin') return 5;
    if (location.pathname === '/caseload') return 6;
    return false;
  };
  
  // Show navigation only if logged in
  if (!isLoggedIn) {
    return (
      <AppBar position="static">
        <Toolbar>
          <SchoolIcon sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Tutoring Scheduler
          </Typography>
        </Toolbar>
      </AppBar>
    );
  }
  
  return (
    <AppBar position="static">
      <Toolbar>
        <SchoolIcon sx={{ mr: 2 }} />
        <Typography variant="h6" component="div" sx={{ mr: 2 }}>
          Tutoring Scheduler
        </Typography>
        
        <Tabs 
          value={getTabValue()} 
          textColor="inherit"
          indicatorColor="secondary"
          sx={{ flexGrow: 1 }}
        >
          <Tab label="Raptor Rotation" onClick={() => navigate('/dashboard')} />
          <Tab label="Requests" onClick={() => navigate('/tutoring')} />
          <Tab label="Events" onClick={() => navigate('/calendar')} />
          <Tab label="Analytics" onClick={() => navigate('/analytics')} />
          {hasCaseload && <Tab label="Caseload" value={6} onClick={() => navigate('/caseload')} />}
          {isAdmin && <Tab label="Roster" value={4} onClick={() => navigate('/roster')} />}
          {isAdmin && <Tab label="Admin" value={5} onClick={() => navigate('/admin')} />}
        </Tabs>
        
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title="Notifications">
            <IconButton color="inherit" onClick={handleBellOpen} sx={{ mr: 1 }}>
              <Badge badgeContent={unreadCount} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={bellAnchor}
            open={!!bellAnchor}
            onClose={() => setBellAnchor(null)}
            slotProps={{ paper: { sx: { maxWidth: 420, maxHeight: 400 } } }}
          >
            {notifications.length === 0 && (
              <MenuItem disabled>
                <ListItemText primary="No notifications" />
              </MenuItem>
            )}

            {notifications.length > 0 && unreadCount > 0 && [
              <MenuItem key="mark-all" onClick={handleMarkAllRead}>
                <ListItemText
                  primary="Mark all as read"
                  primaryTypographyProps={{ variant: 'body2', color: 'primary' }}
                />
              </MenuItem>,
              <Divider key="mark-all-divider" />
            ]}

            {notifications.map(notification => (
              <MenuItem
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                sx={{
                  whiteSpace: 'normal',
                  alignItems: 'flex-start',
                  backgroundColor: notification.read ? 'transparent' : 'action.hover'
                }}
              >
                <ListItemText
                  primary={notification.message}
                  primaryTypographyProps={{
                    variant: 'body2',
                    fontWeight: notification.read ? 'normal' : 'bold'
                  }}
                  secondary={new Date(notification.createdAt).toLocaleString()}
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </MenuItem>
            ))}
          </Menu>

          <Typography variant="subtitle1" sx={{ mr: 2 }}>
            {teacherName || 'Login'}
          </Typography>
          {teacherName &&(
            <Button color="inherit" onClick={handleLogout}>
            Log Out
          </Button>)}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
