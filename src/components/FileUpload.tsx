//src/components/FileUpload.tsx
import React, { useState, useRef } from 'react';
import { 
  Box, 
  Button, 
  Typography, 
  Paper, 
  CircularProgress,
  Alert,
  Snackbar
} from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import { useFiles } from '../contexts/FileContext';
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } from '../config';

   interface FileUploadProps {
     onUploadStart?: () => void;
     onUploadEnd?: () => void;
   }
  
   const FileUpload: React.FC<FileUploadProps> = ({ onUploadStart, onUploadEnd }) => {
  const { uploadFile } = useFiles();
  const [dragging, setDragging] = useState(false);
  const [localUploading, setLocalUploading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    // Validate file
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setError("File type not supported");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
      return;
    }

    // 🚀 start upload with progress & cancel support
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      onUploadStart?.();
      setLocalUploading(true);
      setError(null);
      setProgress(0);

      await uploadFile(file, {
        signal: controller.signal,
        onUploadProgress: (e) => {
          if (e.total) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      });
      setSuccess(true);
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.message === 'canceled') {
        setError('Upload canceled');
      } else {
        setError("Failed to upload file");
        console.error(err);
      }
    } finally {
      abortControllerRef.current = null;
      setLocalUploading(false);
      onUploadEnd?.();
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <Paper
        sx={{
          p: 3,
          mb: 3,
          border: '2px dashed',
          borderColor: dragging ? 'primary.main' : 'divider',
          backgroundColor: dragging ? 'rgba(25, 118, 210, 0.04)' : 'background.paper',
          transition: 'all 0.2s ease-in-out',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 2,
          }}
        >
          <input
            type="file"
            accept={ALLOWED_FILE_TYPES.join(',')}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            ref={fileInputRef}
          />
          
          {localUploading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={24} />
              <Typography>{progress}%</Typography>
              <Button color="error" onClick={() => abortControllerRef.current?.abort()}>
                Cancel
              </Button>
            </Box>
          ) : (
            <UploadIcon sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
          )}
          
          <Typography variant="h6" component="h2" gutterBottom align="center">
            {dragging
              ? "Drop file here"
              : "Drag & drop file here or click to browse"}
          </Typography>
          
          <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 2 }}>
            Supported file types: PDF, TXT, DOC, DOCX, JPG, PNG, GIF, MP4, MP3 (Max: 50MB)
          </Typography>
          
          <Button
            variant="contained"
            onClick={handleButtonClick}
            startIcon={<UploadIcon />}
            disabled={localUploading}
          >
            Upload File
          </Button>
        </Box>
      </Paper>

      <Snackbar 
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={success}
        autoHideDuration={3000}
        onClose={() => setSuccess(false)}
      >
        <Alert onClose={() => setSuccess(false)} severity="success" sx={{ width: '100%' }}>
          File uploaded successfully!
        </Alert>
      </Snackbar>
    </>
  );
};

export default FileUpload;
