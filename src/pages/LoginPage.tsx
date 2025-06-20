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
  Alert
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
  <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#f0f2f5' }}>
    {/* Left promotional panel */}
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
      {/* Left‑aligned title */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          pl: 6,
        }}
      >
        <Typography
          variant="h2"
          sx={{ color: 'white', fontWeight: 700, textAlign: 'left', lineHeight: 1.2 }}
        >
          Swarup Drive
        </Typography>
      </Box>
    </Box>

    {/* Right login panel */}
    <Box
      component="section"
      sx={{
        flex: 1,
        display: 'flex',
        justifyContent: 'flex-end',
        bgcolor: '#ffffff',
      }}
    >
      <Paper
        component="form"
        onSubmit={handleSubmit}
        noValidate
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 360,
          px: 4,
          py: 6,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Avatar sx={{ m: '0 auto 16px', bgcolor: 'primary.main', width: 56, height: 56 }}>
          <LockIcon fontSize="large" />
        </Avatar>

        <Typography component="h1" variant="h5" sx={{ textAlign: 'center', mb: 1, fontWeight: 600 }}>
          Sign In to SwarupDrive
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 3 }}>
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
          variant="standard"
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
          variant="standard"
        />

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mt: 1,
          }}
        >
          <Box component="label" sx={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem' }}>
            <input type="checkbox" style={{ marginRight: 4 }} />
            Remember Me
          </Box>
          <Link component={RouterLink} to="#" variant="body2">
            Forgot Password?
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
            py: 1.25,
            borderRadius: 1,
            backgroundColor: '#7b2cbf',
            '&:hover': { backgroundColor: '#9d4edd' },
          }}
        >
          {loading ? <CircularProgress size={24} sx={{ color: '#fff' }} /> : 'Login'}
        </Button>

        <Grid container justifyContent="center">
          <Grid item>
            <Link
              component={RouterLink}
              to="https://workspace-new.vercel.app/signup"
              variant="body2"
              sx={{ mt: 1 }}
            >
              Not Registered Yet? Create an account
            </Link>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  </Box>
);

};
export default LoginPage;
