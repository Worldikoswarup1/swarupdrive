//swarupdrive/src/pages/LoginPage.tsx
import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Paper,
  Container,
  Avatar,
  Link,
  Grid,
  CircularProgress,
  Alert
} from '@mui/material';
import { LockOutlined as LockIcon } from '@mui/icons-material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingScreen from '../components/LoadingScreen';
import { checkSession } from '../utils/sessionUtils';
import { fetchIP, getDeviceId } from '../utils/deviceUtils'; // assumed utils

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formErrors, setFormErrors] = useState<{ email?: string; password?: string }>({});
  const [checking, setChecking] = useState(true);
  const { login, loading, error, clearError } = useAuth();
  const navigate = useNavigate();

  const validateForm = () => {
    const errors: { email?: string; password?: string } = {};
    let isValid = true;

    if (!email) {
      errors.email = 'Email is required';
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errors.email = 'Email is invalid';
      isValid = false;
    }

    if (!password) {
      errors.password = 'Password is required';
      isValid = false;
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  useEffect(() => {
    const verify = async () => {
      setChecking(true);
      clearError();
      try {
        const ip = await fetchIP();
        const deviceId = getDeviceId();
        const session = await checkSession(ip, deviceId);
        if (session.valid) {
          return navigate('/dashboard');
        }
      } catch {
        clearError();
      } finally {
        setChecking(false);
      }
    };

    verify();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (validateForm()) {
      try {
        await login(email, password);
        navigate('/dashboard');
      } catch {}
    }
  };

  if (checking) {
    return (
      <LoadingScreen>
        <Typography variant="h6" sx={{ mt: 2 }}>
          Checking credentials in Swarup Workspace…
        </Typography>
      </LoadingScreen>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(to right, #0f2027, #203a43, #2c5364)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        px: 2,
      }}
    >
      <Container maxWidth="xs">
        <Paper
          elevation={6}
          sx={{
            backdropFilter: 'blur(15px)',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
            borderRadius: 4,
            p: 4,
            color: 'white',
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Avatar sx={{ m: 1, bgcolor: 'primary.main' }}>
              <LockIcon />
            </Avatar>
            <Typography component="h1" variant="h5" sx={{ mb: 2, color: 'white' }}>
              Sign In to SwarupDrive
            </Typography>
            {error && (
              <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
                {error}
              </Alert>
            )}
            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={!!formErrors.email}
                helperText={formErrors.email}
                InputLabelProps={{ style: { color: 'white' } }}
                InputProps={{
                  style: { color: 'white' },
                }}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={!!formErrors.password}
                helperText={formErrors.password}
                InputLabelProps={{ style: { color: 'white' } }}
                InputProps={{
                  style: { color: 'white' },
                }}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{
                  mt: 3,
                  mb: 2,
                  py: 1.5,
                  background: 'linear-gradient(90deg, #00c9ff, #92fe9d)',
                  color: '#000',
                  fontWeight: 600,
                }}
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : 'Sign In'}
              </Button>
              <Grid container justifyContent="flex-end">
                <Grid item>
                  <Link
                    component={RouterLink}
                    to="https://workspace-new.vercel.app/signup"
                    variant="body2"
                    sx={{ color: '#aadfff' }}
                  >
                    {"Don't have an account? Sign Up"}
                  </Link>
                </Grid>
              </Grid>
            </Box>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default LoginPage;
