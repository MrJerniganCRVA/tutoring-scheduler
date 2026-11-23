import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/auth/current`, { credentials: 'include' });
      if (res.ok) {
        const user = await res.json();
        setCurrentUser(user);
        // Keep non-sensitive display values in localStorage for Header rendering
        localStorage.setItem('teacherId', user.id);
        localStorage.setItem('teacherName', `${user.firstName} ${user.lastName}`);
      } else {
        setCurrentUser(null);
        localStorage.removeItem('teacherId');
        localStorage.removeItem('teacherName');
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const clearUser = () => {
    setCurrentUser(null);
    localStorage.removeItem('teacherId');
    localStorage.removeItem('teacherName');
  };

  return (
    <AuthContext.Provider value={{ currentUser, authLoading, refreshUser, clearUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
