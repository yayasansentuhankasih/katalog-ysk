const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------
// 1. MIDDLEWARE & SETUP AWAL
// ----------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sajikan folder public dan views secara statis
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

app.use(session({
  secret: 'kunci-rahasia-yayasan-sentuhan-kasih',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 * 24 } // 24 jam
}));

const authAdmin = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Akses ditolak. Silakan login terlebih dahulu.' });
};

// Matikan cache agar data kandidat baru langsung muncul di index.html
app.use('/api/candidates', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Serve folder uploads agar foto bisa diakses di browser
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ----------------------------------------------------
// 2. HELPER BACA & SIMPAN DATA JSON
// ----------------------------------------------------
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(__dirname, 'data', 'candidates.json');

const getCandidates = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
};

const saveCandidates = (data) => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
};

// ----------------------------------------------------
// 3. ROUTE HALAMAN (HTML)
// ----------------------------------------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/admin', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.sendFile(path.join(__dirname, 'views', 'admin.html'));
  }
  res.redirect('/login');
});

// ----------------------------------------------------
// 4. API ENDPOINTS
// ----------------------------------------------------

// API Login Admin
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'sentuhan kasih' && password === 'yayasan1996') {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  res.status(400).json({ success: false, message: 'Username atau Password Admin Salah!' });
});

// API Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// API Ambil Semua Data Kandidat
app.get('/api/candidates', (req, res) => {
  const candidates = getCandidates();
  res.json(candidates);
});

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// API Tambah Kandidat Baru (Mendukung Input JSON/URL Gambar)
app.post('/api/candidates', authAdmin, upload.fields([
  { name: 'foto', maxCount: 1 },
  { name: 'fotoCv', maxCount: 1 }
]), (req, res) => {
  try {
    const { nama, umur, asal, keahlian, pengalaman, gaji, kategori, status } = req.body;

    if (!req.files || !req.files.foto) {
      return res.status(400).json({ success: false, message: 'Foto kandidat wajib diupload!' });
    }

    const candidates = getCandidates();

    // Simpan path gambar lokal dari folder /uploads/
    const fotoPath = `/uploads/${req.files.foto[0].filename}`;
    const fotoCvPath = (req.files.fotoCv && req.files.fotoCv[0]) 
      ? `/uploads/${req.files.fotoCv[0].filename}` 
      : fotoPath;

    const newCandidate = {
      id: 'KND-' + Date.now().toString().slice(-4),
      nama,
      kategori: kategori || 'Umum',
      umur: parseInt(umur) || 0,
      asal: asal || '-',
      keahlian: keahlian || '-',
      pengalaman: parseInt(pengalaman) || 0,
      gaji: gaji || 0,
      foto: fotoPath,
      fotoCv: fotoCvPath,
      status: status || 'READY WORK',
      createdAt: new Date().toISOString()
    };

    candidates.unshift(newCandidate);
    saveCandidates(candidates);

    res.json({ success: true, message: 'Kandidat berhasil ditambahkan!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menyimpan data kandidat.' });
  }
});

// API Ubah Status Kandidat
app.patch('/api/candidates/:id/status', authAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  let candidates = getCandidates();
  const index = candidates.findIndex(c => c.id === id);

  if (index !== -1) {
    candidates[index].status = status;
    saveCandidates(candidates);
    return res.json({ success: true });
  }

  res.status(404).json({ success: false, message: 'Kandidat tidak ditemukan.' });
});

// API Hapus Kandidat
app.delete('/api/candidates/:id', authAdmin, (req, res) => {
  const { id } = req.params;
  let candidates = getCandidates();
  
  const candidate = candidates.find(c => c.id === id);
  if (candidate) {
    // Hapus file fisik jika menggunakan file lokal upload
    if (candidate.foto && candidate.foto.startsWith('/uploads/')) {
      const p1 = path.join(__dirname, 'public', candidate.foto);
      if (fs.existsSync(p1)) fs.unlinkSync(p1);
    }
    if (candidate.fotoCv && candidate.fotoCv.startsWith('/uploads/') && candidate.fotoCv !== candidate.foto) {
      const p2 = path.join(__dirname, 'public', candidate.fotoCv);
      if (fs.existsSync(p2)) fs.unlinkSync(p2);
    }
  }

  candidates = candidates.filter(c => c.id !== id);
  saveCandidates(candidates);

  res.json({ success: true });
});

// Endpoint untuk mengubah status kandidat
app.patch('/api/candidates/:id/status', authAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status baru wajib diisi!' });
    }

    const candidates = getCandidates();
    const index = candidates.findIndex(c => c.id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Kandidat tidak ditemukan.' });
    }

    // Update status kandidat
    candidates[index].status = status;
    saveCandidates(candidates);

    res.json({ success: true, message: 'Status kandidat berhasil diperbarui!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal memperbarui status.' });
  }
});

// WAJIB UNTUK VERCEL: Export 'app'
module.exports = app;

// ----------------------------------------------------
// 5. JALANKAN SERVER
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Server Yayasan Aktif di: http://localhost:${PORT}`);
  console.log(`=================================`);
});
