const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------- DIREKTORI & INITIALIZATION -------------------
// Folder uploads berada di dalam folder public
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'candidates.json');

// Buat folder public/uploads jika belum ada
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Buat folder data jika belum ada
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Buat file candidates.json jika belum ada
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

// ------------------- DUMMY SESSION SYSTEM -------------------
let isSessionAdminLoggedIn = false; 

// Middleware Cek Auth Admin
const authAdminMiddleware = (req, res, next) => {
  if (isSessionAdminLoggedIn) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Akses ditolak. Silakan login terlebih dahulu.' });
};

// ------------------- MULTER CONFIG (UPLOAD FILE) -------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ------------------- MIDDLEWARE EXPRESS -------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serving Static Files dari folder public (otomatis mencakup /uploads, /logo.png, dll)
app.use(express.static(path.join(__dirname, 'public')));

// ------------------- HELPER DATA JSON -------------------
function getCandidates() {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function saveCandidates(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// =================================================================
// 🌐 1. ROUTING HALAMAN WEB
// =================================================================

// Route Utama -> index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Route Admin -> login.html / admin.html
app.get('/admin', (req, res) => {
  if (isSessionAdminLoggedIn) {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
  } else {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
  }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', authAdminMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// =================================================================
// 🔐 2. API AUTHENTICATION
// =================================================================

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (username === 'sentuhan kasih' && password === 'yayasan1996') {
    isSessionAdminLoggedIn = true;
    return res.json({ success: true, message: 'Login berhasil!' });
  }

  return res.status(401).json({ success: false, message: 'Username atau password salah!' });
});

app.get('/api/check-auth', (req, res) => {
  res.json({ isAdmin: isSessionAdminLoggedIn });
});

app.post('/api/logout', (req, res) => {
  isSessionAdminLoggedIn = false;
  res.json({ success: true, message: 'Berhasil Logout' });
});

// =================================================================
// 📋 3. API CANDIDATES (CRUD)
// =================================================================

app.get('/api/candidates', (req, res) => {
  const candidates = getCandidates();
  res.json(candidates);
});

app.post('/api/candidates', authAdminMiddleware, upload.fields([
  { name: 'foto', maxCount: 1 },
  { name: 'fotoCv', maxCount: 1 }
]), (req, res) => {
  try {
    const { nama, umur, asal, keahlian, pengalaman, gaji, kategori, status, noHp, tinggi, berat } = req.body;
    const candidates = getCandidates();

    const newId = (candidates.length > 0 ? Math.max(...candidates.map(c => parseInt(c.id) || 0)) + 1 : 1).toString();

    let fotoPath = '';
    let fotoCvPath = '';

    if (req.files && req.files.foto && req.files.foto[0]) {
      fotoPath = `/uploads/${req.files.foto[0].filename}`;
    }

    if (req.files && req.files.fotoCv && req.files.fotoCv[0]) {
      fotoCvPath = `/uploads/${req.files.fotoCv[0].filename}`;
    } else {
      fotoCvPath = fotoPath;
    }

    const newCandidate = {
      id: newId,
      nama: nama || '',
      noHp: noHp || '',
      tinggi: parseInt(tinggi) || 0,
      berat: parseInt(berat) || 0,
      kategori: kategori || 'Asisten Rumah Tangga (ART)',
      umur: parseInt(umur) || 0,
      asal: asal || '',
      keahlian: keahlian || '',
      pengalaman: parseInt(pengalaman) || 0,
      gaji: parseInt(gaji) || 0,
      status: status || 'READY WORK',
      foto: fotoPath,
      fotoCv: fotoCvPath,
      createdAt: new Date().toISOString()
    };

    candidates.push(newCandidate);
    saveCandidates(candidates);

    res.json({ success: true, message: 'Data kandidat berhasil ditambahkan!', data: newCandidate });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menambahkan data.' });
  }
});

app.put('/api/candidates/:id', authAdminMiddleware, upload.fields([
  { name: 'foto', maxCount: 1 },
  { name: 'fotoCv', maxCount: 1 }
]), (req, res) => {
  try {
    const { id } = req.params;
    const { nama, umur, asal, keahlian, pengalaman, gaji, kategori, status, noHp, tinggi, berat } = req.body;

    const candidates = getCandidates();
    const index = candidates.findIndex(c => String(c.id) === String(id));

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Kandidat tidak ditemukan.' });
    }

    const currentCandidate = candidates[index];

    let fotoPath = currentCandidate.foto;
    if (req.files && req.files.foto && req.files.foto[0]) {
      if (currentCandidate.foto && currentCandidate.foto.startsWith('/uploads/')) {
        const oldFile = path.join(UPLOAD_DIR, currentCandidate.foto.replace('/uploads/', ''));
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }
      fotoPath = `/uploads/${req.files.foto[0].filename}`;
    }

    let fotoCvPath = currentCandidate.fotoCv;
    if (req.files && req.files.fotoCv && req.files.fotoCv[0]) {
      if (currentCandidate.fotoCv && currentCandidate.fotoCv.startsWith('/uploads/') && currentCandidate.fotoCv !== currentCandidate.foto) {
        const oldCvFile = path.join(UPLOAD_DIR, currentCandidate.fotoCv.replace('/uploads/', ''));
        if (fs.existsSync(oldCvFile)) fs.unlinkSync(oldCvFile);
      }
      fotoCvPath = `/uploads/${req.files.fotoCv[0].filename}`;
    }

    candidates[index] = {
      ...currentCandidate,
      nama: nama !== undefined ? nama : currentCandidate.nama,
      noHp: noHp !== undefined ? noHp : currentCandidate.noHp,
      tinggi: tinggi ? parseInt(tinggi) : currentCandidate.tinggi,
      berat: berat ? parseInt(berat) : currentCandidate.berat,
      kategori: kategori !== undefined ? kategori : currentCandidate.kategori,
      umur: umur ? parseInt(umur) : currentCandidate.umur,
      asal: asal !== undefined ? asal : currentCandidate.asal,
      keahlian: keahlian !== undefined ? keahlian : currentCandidate.keahlian,
      pengalaman: pengalaman ? parseInt(pengalaman) : currentCandidate.pengalaman,
      gaji: gaji ? parseInt(gaji) : currentCandidate.gaji,
      status: status !== undefined ? status : currentCandidate.status,
      foto: fotoPath,
      fotoCv: fotoCvPath,
      updatedAt: new Date().toISOString()
    };

    saveCandidates(candidates);
    res.json({ success: true, message: 'Data kandidat berhasil diperbarui!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal memperbarui data kandidat.' });
  }
});

app.patch('/api/candidates/:id/status', authAdminMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const candidates = getCandidates();
    const index = candidates.findIndex(c => String(c.id) === String(id));

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Kandidat tidak ditemukan.' });
    }

    candidates[index].status = status;
    saveCandidates(candidates);

    res.json({ success: true, message: 'Status berhasil diperbarui!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal memperbarui status.' });
  }
});

app.delete('/api/candidates/:id', authAdminMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    let candidates = getCandidates();
    const target = candidates.find(c => String(c.id) === String(id));

    if (target) {
      if (target.foto && target.foto.startsWith('/uploads/')) {
        const file = path.join(UPLOAD_DIR, target.foto.replace('/uploads/', ''));
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      if (target.fotoCv && target.fotoCv.startsWith('/uploads/') && target.fotoCv !== target.foto) {
        const cvFile = path.join(UPLOAD_DIR, target.fotoCv.replace('/uploads/', ''));
        if (fs.existsSync(cvFile)) fs.unlinkSync(cvFile);
      }
    }

    candidates = candidates.filter(c => String(c.id) !== String(id));
    saveCandidates(candidates);

    res.json({ success: true, message: 'Kandidat berhasil dihapus!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menghapus kandidat.' });
  }
});

// ------------------- RUN SERVER -------------------
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Server Berjalan!`);
  console.log(`📍 Directori Upload : ${UPLOAD_DIR}`);
  console.log(`📍 File JSON Data   : ${DATA_FILE}`);
  console.log(`📍 URL Katalog Utama: http://localhost:${PORT}/`);
  console.log(`==================================================`);
});
