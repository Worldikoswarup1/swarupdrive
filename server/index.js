//swarupdrive/server/index.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pg from 'pg';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseBuffer } from 'music-metadata';
import { parseFile } from 'music-metadata';
import ffmpeg from 'fluent-ffmpeg';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';


// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });


// ─── Supabase Storage Setup ─────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const BUCKET = process.env.SUPABASE_BUCKET;


const FFMPEG_BIN  = process.env.FFMPEG_PATH  || 'ffmpeg';
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';

// resolve relative paths
const ffmpegPath  = path.resolve(__dirname, FFMPEG_BIN);
const ffprobePath = path.resolve(__dirname, FFPROBE_BIN);

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);


console.log('Using ffmpeg:', ffmpegPath);
console.log('Using ffprobe:', ffprobePath);



const PRIVATE_KEY = fs.readFileSync(
  path.resolve(__dirname, process.env.PRIVATE_KEY_PATH),
  'utf8'
);
const PUBLIC_KEY = fs.readFileSync(
  path.resolve(__dirname, process.env.PUBLIC_KEY_PATH),
  'utf8'
);
console.log('→ Loaded DATABASE_URL =', process.env.DATABASE_URL);


// Create storage directories if they don't exist
const STORAGE_DIR = path.join(__dirname, 'storage');
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Database configuration
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/securedrive',
});

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // In production, use a strong secret key

const JWT_EXPIRES_IN = '7d';

// AES encryption configuration
// AES-256-GCM configuration
// ENCRYPTION_KEY must be a 64-char hex string in your .env
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
if (ENCRYPTION_KEY.length !== 32) {
  throw new Error(`Invalid ENCRYPTION_KEY length: ${ENCRYPTION_KEY.length} bytes (expected 32)`);
}
// GCM recommends a 12-byte IV
const IV_LENGTH = 12;


// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, STORAGE_DIR);
  },
  filename: (req, file, cb) => {
    const fileId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${fileId}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 10MB max file size
});

// Initialize Express app
const app = express();
const server = http.createServer(app);

// CORS origin checker
const FRONTEND_URL = process.env.FRONTEND_URL;            // ← add this key to .env
const LOCALHOST_REGEX = /^http:\/\/localhost:\d+$/;
function checkOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (origin === FRONTEND_URL || LOCALHOST_REGEX.test(origin)) {
    return callback(null, true);
  }
  return callback(new Error(`Origin ${origin} not allowed by CORS`));
}

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: checkOrigin,
    methods: ['GET','POST'],
    credentials: true,
  },
});


// Middleware
app.use(cors({
  origin: checkOrigin,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(express.json());


// Authentication middleware (RS‑256 only)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};



// Encryption/Decryption functions

const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);                           // 12-byte IV
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    iv: iv.toString('hex'),                                           // store hex-encoded IV
    content: encrypted,
    authTag: authTag.toString('hex'),                                 // store hex-encoded tag
  };
};

const decrypt = ({ iv, content, authTag }) => {
  const ivBuf      = Buffer.from(iv, 'hex');
  const tagBuf     = Buffer.from(authTag, 'hex');
  const decipher   = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, ivBuf);

  decipher.setAuthTag(tagBuf);

  let decrypted = decipher.update(content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};



// Initialize database tables
const initDatabase = async () => {
  try {
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create files table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        iv TEXT,
        auth_tag TEXT,
        encrypted BOOLEAN DEFAULT TRUE,
        owner_id UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create shares table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shares (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_id UUID REFERENCES files(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE
      );
    `);
    
    // Create user_files table for tracking which users have access to which files
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_files (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        file_id UUID REFERENCES files(id) ON DELETE CASCADE,
        permission TEXT NOT NULL DEFAULT 'read', -- 'read', 'write'
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, file_id)
      );
    `);


    //create music-metadata tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS music_metadata (
        file_id UUID PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        artist TEXT,
        album TEXT,
        cover TEXT,   -- base64 or URL of thumbnail image
        lyrics TEXT   -- optional lyrics (plain text or JSON string)
      );
    `);

    // OTP table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Face data table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS face_data (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        descriptor JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Video metadata table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS video_metadata (
        file_id     UUID        PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
        title       TEXT        NOT NULL,
        description TEXT,
        duration    INTEGER,     -- duration in seconds
        thumbnail   TEXT,        -- URL or base64-encoded image
        resolution  TEXT,        -- e.g. '1920x1080'
        codec       TEXT,        -- e.g. 'h264', 'vp9'
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);


    
    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database tables:', err);
  }
};

// Initialize the database
initDatabase();

// API Routes

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  
  try {
    // Check if user already exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create new user
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );
    
    const user = result.rows[0];
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: JWT_EXPIRES_IN }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Check if user exists
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      PRIVATE_KEY,
      { algorithm: 'RS256', expiresIn: JWT_EXPIRES_IN }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
    },
  });
});

// File Routes
app.get('/api/files', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.name, f.type, f.size, f.created_at, f.updated_at, f.owner_id,
       CASE WHEN s.id IS NOT NULL THEN true ELSE false END as is_shared
       FROM files f
       LEFT JOIN shares s ON f.id = s.file_id
       WHERE f.owner_id = $1
       OR f.id IN (
         SELECT file_id FROM user_files WHERE user_id = $1
       )
       ORDER BY f.updated_at DESC`,
      [req.user.id]
    );
    
    res.json({ files: result.rows });
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ message: 'Failed to fetch files' });
  }
});

app.post('/api/files/upload', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  
  try {
    const { originalname, mimetype, size, path: filePath } = req.file;
    
    // For text files, encrypt the content
    let iv = null;
    let authTag = null;
    
    if (mimetype === 'text/plain') {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const encrypted = encrypt(fileContent);
      
      // Save the encrypted content back to the file
      fs.writeFileSync(filePath, encrypted.content, 'hex');
      
      iv = encrypted.iv;
      authTag = encrypted.authTag;
    }
    
    // 1) Upload the raw (or encrypted) file to Supabase Storage
    const key = `${uuidv4()}${path.extname(originalname)}`;
    const fileBuffer = fs.readFileSync(filePath);
    const { error: uploadError } = await supabase
      .storage
      .from(BUCKET)
      .upload(key, fileBuffer, { contentType: mimetype });
    if (uploadError) throw uploadError;
    // remove temp file
    fs.unlinkSync(filePath);
  
    // 2) Insert file metadata into your DB, storing `key` as the storage_path
    const result = await pool.query(
      `INSERT INTO files
         (name, type, size, storage_path, iv, auth_tag, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, name, type, size, created_at, updated_at, owner_id`,
      [originalname, mimetype, size, key, iv, authTag, req.user.id]
    );
    
    // Insert into user_files for owner with write permission
    await pool.query(
      `INSERT INTO user_files (user_id, file_id, permission)
       VALUES ($1, $2, 'write')`,
      [req.user.id, result.rows[0].id]
    );
    
    // 3) If this is an audio file, extract and save metadata
    if (mimetype.startsWith('audio/')) {
      // Read and (if encrypted) decrypt into a buffer
      let buffer = fs.readFileSync(filePath);
      if (iv && authTag) {
        // decrypt returns UTF-8 string, convert back to Buffer
        const decryptedStr = decrypt({ iv, content: buffer.toString('hex'), authTag });
        buffer = Buffer.from(decryptedStr, 'utf8');
      }
      
      // Parse ID3 tags
      const metadata = await parseBuffer(buffer, mimetype);
      const common = metadata.common;
      
      // Build cover data URI if present
      let cover = null;
      if (common.picture && common.picture.length) {
        const pic = common.picture[0];
        cover = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`;
      }
      
      // Insert into music_metadata

      let fileId = result.rows[0].id; // or wherever the value should come from

      await pool.query(
        `INSERT INTO music_metadata (file_id,title,artist,album,cover,lyrics)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          fileId,
          common.title   || null,
          common.artist  || null,
          common.album   || null,
          cover          || null,
          null           // or supply lyrics if you have them
        ]
      );
    }

    if (mimetype.startsWith('video/')) {
     ffmpeg.ffprobe(filePath, async (err, metadata) => {
        if (err) {
          console.error('Error probing video metadata:', err);
        } else {
          try {
            const format = metadata.format;
            const streams = metadata.streams || [];
            const videoStream = streams.find(s => s.codec_type === 'video');

            const duration = Math.floor(format.duration || 0);  // now 7                      // in seconds
            const resolution = videoStream
              ? `${videoStream.width}x${videoStream.height}`
              : null;

            // Optionally: generate a thumbnail
            let thumbnailUrl = null;
            const thumbFile = `${filename}_thumb.jpg`;
            await new Promise((resolve, reject) => {
              ffmpeg(filePath)
                .screenshots({
                  timestamps: [ '00:00:01.000' ],    // at 1 second
                  filename: thumbFile,
                  folder: STORAGE_DIR,
                  size: '320x240',
                })
                .on('end', resolve)
                .on('error', reject);
            });
            thumbnailUrl = `/storage/${thumbFile}`;

            // Insert into video_metadata
            await pool.query(
              `INSERT INTO video_metadata 
                 (file_id, title, duration, resolution, thumbnail, codec) 
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                result.rows[0].id,
                originalname || result.rows[0].name,       // supply a non-null title
                duration,
                resolution,
                thumbnailUrl,
                videoStream?.codec_name || null
              ]
            );

          } catch (dbErr) {
            console.error('Error inserting video_metadata:', dbErr);
          }
        }
      });
    }


    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        ...result.rows[0],
        is_shared: false,
      },
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    // Clean up the uploaded file if there was an error
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Failed to upload file' });
  }
});





// GET existing share token
app.get('/api/files/:id/share', authenticateToken, async (req, res) => {
  const fileId = req.params.id;
  try {
    const result = await pool.query(
      'SELECT token FROM shares WHERE file_id = $1',
      [fileId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'No share token for this file' });
    }
    return res.json({ token: result.rows[0].token });
  } catch (err) {
    console.error('Error fetching share token:', err);
    res.status(500).json({ message: 'Could not fetch share token' });
  }
});






app.get('/api/files/:id/content', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if user has access to file
    const accessCheck = await pool.query(
      `SELECT f.* FROM files f
       JOIN user_files uf ON f.id = uf.file_id
       WHERE f.id = $1 AND uf.user_id = $2`,
      [id, req.user.id]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ message: 'You do not have access to this file' });
    }
    
    const file = accessCheck.rows[0];
    
    // Download from Supabase Storage
    const key = file.storage_path;
    const { data: downloadStream, error: downloadError } = await supabase
      .storage
      .from(BUCKET)
      .download(key);
    if (downloadError) {
      console.error('Supabase download error:', downloadError);
      return res.status(404).json({ message: 'File not found' });
    }
  
    // Stream raw bytes into a string (for text files) or pipe directly
    if (file.encrypted && file.iv && file.auth_tag) {
      // collect buffer
      const chunks = [];
      downloadStream.on('data', c => chunks.push(c));
      downloadStream.on('end', () => {
        const hex = Buffer.concat(chunks).toString('hex');
        const decrypted = decrypt({ iv: file.iv, content: hex, authTag: file.auth_tag });
        res.json({ content: decrypted });
      });
    } else {
      // For plaintext, read buffer → to string
      const chunks = [];
      downloadStream.on('data', c => chunks.push(c));
      downloadStream.on('end', () => {
        res.json({ content: Buffer.concat(chunks).toString('utf8') });
      });
    }
  
  } catch (err) {
    console.error('Error fetching file content:', err);
    res.status(500).json({ message: 'Failed to get file content' });
  }
});

app.put('/api/files/:id/content', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ message: 'Content is required' });
  }
  
  try {
    // Check if user has write access to file
    const accessCheck = await pool.query(
      `SELECT f.* FROM files f
       JOIN user_files uf ON f.id = uf.file_id
       WHERE f.id = $1 AND uf.user_id = $2 AND uf.permission = 'write'`,
      [id, req.user.id]
    );
    
    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ message: 'You do not have write access to this file' });
    }
    
    const file = accessCheck.rows[0];
    
    // Encrypt content
    const encrypted = encrypt(content);
    
    // Write to file
    const filePath = path.join(STORAGE_DIR, file.storage_path);
    fs.writeFileSync(filePath, encrypted.content, 'hex');
    
    // Update file metadata
    await pool.query(
      `UPDATE files SET iv = $1, auth_tag = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [encrypted.iv, encrypted.authTag, id]
    );
    
    res.json({ message: 'File content updated successfully' });
  } catch (err) {
    console.error('Error updating file content:', err);
    res.status(500).json({ message: 'Failed to update file content' });
  }
});

app.get('/api/files/:id/download', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // 1) Fetch file record, bypassing access control for the service account
    let file;
    if (req.user.id === process.env.SERVICE_ACCOUNT_ID) {
      const { rows } = await pool.query(
        'SELECT * FROM files WHERE id = $1',
        [id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: 'File not found' });
      }
      file = rows[0];
    } else {
      const { rows } = await pool.query(
        `SELECT f.* 
         FROM files f
         JOIN user_files uf ON f.id = uf.file_id
         WHERE f.id = $1 AND uf.user_id = $2`,
        [id, req.user.id]
      );
      if (rows.length === 0) {
        return res.status(403).json({ message: 'You do not have access to this file' });
      }
      file = rows[0];
    }

    // 2) Resolve on‑disk path
    const fullPath = path.join(STORAGE_DIR, file.storage_path);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }

    // 3) Handle text‑file decryption (AES‑256‑GCM)
    if (file.encrypted && file.iv && file.auth_tag && file.type === 'text/plain') {
      const encryptedHex = fs.readFileSync(fullPath, 'hex');
      const decrypted = decrypt({
        iv: file.iv,
        content: encryptedHex,
        authTag: file.auth_tag
      });
      res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
      res.setHeader('Content-Type', file.type);
      return res.send(decrypted);
    }

    // 4) Support byte‑range streaming for all other file types
    const stat  = fs.statSync(fullPath);
    const total = stat.size;
    const range = req.headers.range;

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end   = endStr ? parseInt(endStr, 10) : total - 1;

      if (start >= total || end >= total) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`);
        return res.end();
      }

      const chunkSize = end - start + 1;
      const stream    = fs.createReadStream(fullPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': file.type
      });
      return stream.pipe(res);
    }

    // 5) No Range requested: send full file
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': file.type,
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(fullPath).pipe(res);

  } catch (err) {
    console.error('Error in /api/files/:id/download:', err);
    res.status(500).json({ message: 'Failed to download file' });
  }
});


app.delete('/api/files/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if user is the owner of the file
    const fileCheck = await pool.query(
      'SELECT * FROM files WHERE id = $1 AND owner_id = $2',
      [id, req.user.id]
    );
    
    if (fileCheck.rows.length === 0) {
      return res.status(403).json({ message: 'You can only delete files you own' });
    }
    
    const file = fileCheck.rows[0];
    
    // Delete file from storage
    const filePath = path.join(STORAGE_DIR, file.storage_path);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Delete file record from database
    await pool.query('DELETE FROM files WHERE id = $1', [id]);
    
    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    console.error('Error deleting file:', err);
    res.status(500).json({ message: 'Failed to delete file' });
  }
});

app.post('/api/files/:id/share', authenticateToken, async (req, res) => {
  const fileId = req.params.id;

  try {
    // 1. Check ownership
    const owns = await pool.query(
      'SELECT 1 FROM files WHERE id = $1 AND owner_id = $2',
      [fileId, req.user.id]
    );
    if (owns.rowCount === 0) {
      return res.status(403).json({ message: 'You can only share files you own' });
    }

    // 2. If a share already exists, return it
    const existing = await pool.query(
      'SELECT token FROM shares WHERE file_id = $1',
      [fileId]
    );
    if (existing.rowCount > 0) {
      return res.json({ token: existing.rows[0].token });
    }

    // 3. Otherwise generate and insert a new one
    const raw = crypto.randomBytes(16).toString('hex');
    const token = `swarupdrive_share?${raw}`;
    // Create a share record (now storing the prefixed token)
    await pool.query(
      'INSERT INTO shares (file_id, token) VALUES ($1, $2)',
      [fileId, token]
    );
    res.json({ token });
  } catch (err) {
    console.error('Error sharing file:', err);
    res.status(500).json({ message: 'Failed to share file' });
  }
});

app.post('/api/files/join-team', authenticateToken, async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }
  
  try {
    // Find the share by token
    const shareResult = await pool.query(
      'SELECT * FROM shares WHERE token = $1',
      [token]
    );
    
    if (shareResult.rows.length === 0) {
      return res.status(404).json({ message: 'Invalid or expired token' });
    }
    
    const share = shareResult.rows[0];
    
    // Check if user already has access to this file
    const existingAccess = await pool.query(
      'SELECT * FROM user_files WHERE user_id = $1 AND file_id = $2',
      [req.user.id, share.file_id]
    );
    
    if (existingAccess.rows.length > 0) {
      return res.status(400).json({ message: 'You already have access to this file' });
    }
    
    // Grant 'write' permission to the user
    await pool.query(
      'INSERT INTO user_files (user_id, file_id, permission) VALUES ($1, $2, $3)',
      [req.user.id, share.file_id, 'write']
    );
    
    res.json({ message: 'Successfully joined the team' });
  } catch (err) {
    console.error('Error joining team:', err);
    res.status(500).json({ message: 'Failed to join team' });
  }
});




app.post('/api/music/metadata', authenticateToken, async (req, res) => {
  const { file_id, title, artist, album, cover, lyrics } = req.body;

  try {
    // Check if file belongs to the user
    const fileCheck = await pool.query('SELECT * FROM files WHERE id = $1 AND owner_id = $2', [file_id, req.user.id]);
    if (fileCheck.rows.length === 0) {
      return res.status(403).json({ message: 'File not found or access denied' });
    }

    // Insert or update music_metadata
    const existing = await pool.query('SELECT * FROM music_metadata WHERE file_id = $1', [file_id]);

    if (existing.rows.length > 0) {
      // Update existing metadata
      await pool.query(`
        UPDATE music_metadata SET title=$2, artist=$3, album=$4, cover=$5, lyrics=$6 WHERE file_id=$1
      `, [file_id, title, artist, album, cover, lyrics]);
    } else {
      // Insert new metadata
      await pool.query(`
        INSERT INTO music_metadata (file_id, title, artist, album, cover, lyrics) VALUES ($1, $2, $3, $4, $5, $6)
      `, [file_id, title, artist, album, cover, lyrics]);
    }

    res.status(200).json({ message: 'Music metadata saved successfully' });
  } catch (err) {
    console.error('Error saving music metadata:', err);
    res.status(500).json({ message: 'Failed to save music metadata' });
  }
});


/*
 Verify a workspace-issued JWT against our `sessions` table.
 Expects: Authorization: Bearer <token>
 */

 app.get('/api/sessions/verify', async (req, res) => {
   const authHeader = req.headers.authorization;
   if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ valid: false });
   const token = authHeader.slice(7);
   try {
     const payload = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
     const { rows } = await pool.query(
       `SELECT 1 FROM sessions
        WHERE jwt_id     = $1
          AND ip_address = $2
          AND device_id  = $3
          AND now() < expires_at
          AND NOT revoked`,
       [
         payload.jti,
         req.ip,
         req.headers['user-agent']
       ]
     );
     return res.json({ valid: rows.length > 0 });
   } catch {
     return res.status(403).json({ valid: false });
   }
 });


 // swarupdrive/server/index.js

  // ... your existing imports & middleware ...

  // at the bottom, after all the other routes:
  app.post('/api/session/validate', authenticateToken, async (req, res) => {
    const { ip, deviceId } = req.body;
    try {
      const result = await pool.query(
        `SELECT 1 FROM sessions
         WHERE user_id = $1
           AND ip_address = $2
           AND device_id = $3
           AND expires_at > now()
           AND NOT revoked`,
        [req.user.sub, ip, deviceId]
      );
      res.json({ valid: result.rowCount === 1 });
    } catch (err) {
      console.error('Session validation error:', err);
      res.status(500).json({ error: 'Session validation error' });
    }
  });




// Socket.io handling
const activeRooms = new Map(); // Map of fileId to set of active user IDs

io.use((socket, next) => {
  // Authenticate socket connection
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error'));
  }
  
  jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] }, (err, decoded) => {
    if (err) {
      return next(new Error('Authentication error'));
    }
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.id}`);
  
  socket.on('join-edit-room', async ({ fileId }) => {
    // Join the socket room for this file
    socket.join(`file:${fileId}`);
    
    // If room doesn't exist yet, initialize it
    if (!activeRooms.has(fileId)) {
      activeRooms.set(fileId, new Map());
    }
    
    // Add user to active room
    const room = activeRooms.get(fileId);
    room.set(socket.user.id, {
      id: socket.user.id,
      name: socket.user.name,
      color: socket.handshake.query.color || '#1976d2', // Default color if none provided
    });
    
    // Broadcast updated active users list
    io.to(`file:${fileId}`).emit('active-users', {
      users: Array.from(room.values()),
    });
    
    console.log(`User ${socket.user.id} joined edit room for file ${fileId}`);
  });
  
  socket.on('leave-edit-room', ({ fileId }) => {
    handleLeaveRoom(socket, fileId);
  });
  
  socket.on('content-change', ({ fileId, content, userId }) => {
    // Broadcast content changes to all other users in the room
    socket.to(`file:${fileId}`).emit('content-changed', { content, userId });
  });
  
  socket.on('disconnect', () => {
    // Remove user from all active rooms
    for (const [fileId, room] of activeRooms.entries()) {
      if (room.has(socket.user.id)) {
        handleLeaveRoom(socket, fileId);
      }
    }
    
    console.log(`User disconnected: ${socket.user.id}`);
  });
});

function handleLeaveRoom(socket, fileId) {
  socket.leave(`file:${fileId}`);
  
  if (activeRooms.has(fileId)) {
    const room = activeRooms.get(fileId);
    room.delete(socket.user.id);
    
    // If room is empty, delete it
    if (room.size === 0) {
      activeRooms.delete(fileId);
    } else {
      // Broadcast updated active users list
      io.to(`file:${fileId}`).emit('active-users', {
        users: Array.from(room.values()),
      });
    }
  }
  
  console.log(`User ${socket.user.id} left edit room for file ${fileId}`);
}

// Start the server
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
