//swarupdrive/src/pages/LoginPage.tsx
import React, { useState } from 'react';
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
  Alert,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import { LockOutlined as LockIcon } from '@mui/icons-material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';
import LoadingScreen from '../components/LoadingScreen';
import { checkSession } from '../utils/sessionUtils';

  const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formErrors, setFormErrors] = useState<{email?: string, password?: string}>({});
  const [checking, setChecking] = useState(true);
  const { login, loading, error, clearError } = useAuth();
  const navigate = useNavigate();

  const validateForm = () => {
    const errors: {email?: string, password?: string} = {};
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

  // on mount, verify session and redirect if valid
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
       // you could set a local message via another state if you like
     } finally {
       setChecking(false);
     }
   };

    verify();
  }, [navigate]);


  

  if (checking) {
    return (
      <LoadingScreen>
        <Typography variant="h6" sx={{ mt: 2 }}>
          Checking credentials in Swarup Workspace…
        </Typography>
      </LoadingScreen>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    
    if (validateForm()) {
      try {
        await login(email, password);
        navigate('/dashboard');
      } catch (err) {
        // Error is handled by the context
      }
    }
  };

return (
  <Box sx={{ display: 'flex', minHeight: '100vh' }}>
    {/* Left promotional panel (fills remaining space) */}
    <Box
      sx={{
        flex: 1,
        position: 'relative',
        backgroundImage:
          'url(https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=750&w=1260)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Dark overlay */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: 'rgba(0,0,0,0.4)',
        }}
      />
      {/* Left-aligned title */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          pl: 8,
        }}
      >
        <Typography
          variant="h2"
          sx={{
            color: '#fff',
            fontWeight: 700,
            fontSize: { xs: '2rem', md: '3rem' },
            lineHeight: 1.1,
          }}
        >
          Swarup Drive
        </Typography>
      </Box>
    </Box>

    {/* Right login panel (fixed max width, right‑aligned, slight inset) */}
    <Box
      component="section"
      sx={{
        width: '100%',
        maxWidth: 400,
        ml: 'auto',    // pushes it to the right
        mr: 4,         // slight inset from right edge
        bgcolor: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        px: 4,
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        noValidate
        sx={{ width: '100%' }}
      >
        {/* Logo above the Sign In heading */}
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <img
            src="/icon.png"
            alt="SwarupDrive Logo"
            width={48}
            height={48}
            style={{ display: 'inline-block' }}
          />
        </Box>
        <Typography
          component="h1"
          variant="h4"
          sx={{ mb: 1, fontWeight: 600, color: '#333' }}
        >
          Sign In
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          See what’s going on with your business
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          margin="normal"
          required
          fullWidth
          id="email"
          label="Email"
          name="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={!!formErrors.email}
          helperText={formErrors.email}
          variant="outlined"
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
          variant="outlined"
        />

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mt: 1,
          }}
        >
          <FormControlLabel
            control={<Checkbox size="small" />}
            label={<Typography variant="body2">Remember me</Typography>}
          />
          <Link
            component={RouterLink}
            to="#"
            underline="none"
            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
          >
            Forgot password?
          </Link>
        </Box>

        <Button
          type="submit"
          fullWidth
          variant="contained"
          disabled={loading}
          sx={{
            mt: 4,
            mb: 2,
            py: 1.5,
            borderRadius: 1,
            background: 'linear-gradient(90deg, #667eea, #764ba2)',
            fontWeight: 600,
            fontSize: '1rem',
            '&:hover': { background: 'linear-gradient(90deg, #5a67d8, #6b46c1)' },
          }}
        >
          {loading ? <CircularProgress size={24} sx={{ color: '#fff' }} /> : 'Login'}
        </Button>

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Typography variant="body2" component="span" color="text.secondary">
            Not registered yet?{' '}
          </Typography>
          <Link
            component={RouterLink}
            to="https://workspace-new.vercel.app/signup"
            underline="none"
            sx={{ fontWeight: 600 }}
          >
            Create an account
          </Link>
        </Box>
      </Box>
    </Box>
  </Box>
);

};
export default LoginPage;
