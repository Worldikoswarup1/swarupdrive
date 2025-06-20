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
          display: { xs: 'none', md: 'block' }, // hide on mobile
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
        {/* Title shifted left */}
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            pl: 6,
          }}
        >
          <Typography
            variant="h2"
            sx={{
              color: 'white',
              fontWeight: 700,
              textAlign: 'left',
              lineHeight: 1.2,
            }}
          >
            Swarup Drive
          </Typography>
        </Box>
      </Box>

      {/* Right login panel */}
      <Container
        component="main"
        maxWidth="xs"
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
          py: 4,
        }}
      >
        <Paper
          elevation={12}
          sx={{
            width: '100%',
            p: { xs: 3, sm: 5 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            borderRadius: 4,
            backdropFilter: 'blur(16px)',
            background: 'rgba(255,255,255,0.75)',
            boxShadow: '0 12px 24px rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.4)',
          }}
        >
          <Avatar sx={{ m: 1, bgcolor: 'primary.main', width: 56, height: 56 }}>
            <LockIcon fontSize="large" />
          </Avatar>
          <Typography component="h1" variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
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
              variant="outlined"
              sx={{
                background: 'rgba(255,255,255,0.9)',
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  '& fieldset': { borderColor: '#ccc' },
                  '&:hover fieldset': { borderColor: '#888' },
                  '&.Mui-focused fieldset': { borderColor: '#4e54c8' },
                },
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
              variant="outlined"
              sx={{
                background: 'rgba(255,255,255,0.9)',
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  '& fieldset': { borderColor: '#ccc' },
                  '&:hover fieldset': { borderColor: '#888' },
                  '&.Mui-focused fieldset': { borderColor: '#4e54c8' },
                },
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{
                mt: 3,
                mb: 2,
                py: 1.75,
                borderRadius: 3,
                background: 'linear-gradient(90deg, #667eea, #764ba2)',
                boxShadow: '0 6px 12px rgba(0,0,0,0.15)',
                fontSize: '1rem',
                fontWeight: 700,
              }}
            >
              {loading ? <CircularProgress size={24} sx={{ color: '#fff' }} /> : 'Sign In'}
            </Button>

            <Grid container justifyContent="flex-end" sx={{ mt: 1 }}>
              <Grid item>
                <Link
                  component={RouterLink}
                  to="https://workspace-new.vercel.app/signup"
                  variant="body2"
                  sx={{ color: 'rgba(0,0,0,0.6)', '&:hover': { color: 'rgba(0,0,0,0.9)' } }}
                >
                  {"Don't have an account? Sign Up"}
                </Link>
              </Grid>
            </Grid>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};
export default LoginPage;
