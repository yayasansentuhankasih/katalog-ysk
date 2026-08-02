const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const cors = require('cors'); // 👈 ✅ 1. DITAMBAHKAN PACKAGE CORS

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Proxy (Penting jika di-deploy di Railway / cloud server dengan HTTPS)
app.set('trust proxy', 1); // 👈 ✅ 2. DITAMBAHKAN UNTUK HANDLING PROXY CLOUD

// ------------------- MIDDLEWARE CORS & BODY PARSER -------------------
app.use(cors({
  origin: function (origin, callback) {
    return callback(null, true); // Dinamis mengizinkan origin pengirim
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =================================================================
// 📱 KONFIGURASI 2 NOMOR WA ADMIN
// =================================================================
const WA_ADMINS = [
  { 
    id: 1,
    nama: 'Admin 1', 
    noHp: '6285111021218', 
    linkWa: 'https://wa.me/6285111021218'
  },
  { 
    id: 2,
    nama: 'Admin 2', 
    noHp: '6281399243318', 
    linkWa: 'https://wa.me/6281399243318'
  }
];

// ------------------- DIREKTORI & INITIALIZATION -------------------
const STORAGE_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'storage');
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
const DATA_DIR = path.join(STORAGE_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'candidates.json');

[UPLOAD_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
}

// ------------------- DUMMY ACCOUNT CONFIG -------------------
const ADMIN_ACCOUNT = {
  username: process.env.ADMIN_USER || 'sentuhan kasih',
  password: process.env.ADMIN_PASS || 'yayasan1996'
};

// ------------------- STATIC FILES -------------------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ------------------- CONFIG EXPRESS SESSION -------------------
app.use(session({
  secret: process.env.SESSION_SECRET || 'sentuhan_kasih_secret_key_123',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) ? 'none' : 'lax',
    secure: (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) ? true : false
  }
}));

// Middleware Auth berbasis Session Cookie
const authAdminMiddleware = (req, res, next) => {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ success: false, message: 'Akses ditolak. Silakan login terlebih dahulu.' });
};

// ------------------- HELPER DATA JSON -------------------
function getCandidates() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    if (!data.trim()) return [];
    return JSON.parse(data);
  } catch (err) {
    console.error('Error membaca candidates.json:', err.message);
    return [];
  }
}

function saveCandidates(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error menyimpan candidates.json:', err.message);
  }
}

// ------------------- HELPER GENERATE ID PER KATEGORI -------------------
function generateCategoryId(kategoriInput, candidates) {
  let mainKategori = '';

  if (Array.isArray(kategoriInput)) {
    mainKategori = kategoriInput[0] || '';
  } else if (typeof kategoriInput === 'string') {
    try {
      const parsed = JSON.parse(kategoriInput);
      mainKategori = Array.isArray(parsed) ? (parsed[0] || '') : kategoriInput;
    } catch(e) {
      mainKategori = kategoriInput;
    }
  }

  let prefix = 'KAND';
  const katLower = mainKategori.toLowerCase();

  if (katLower.includes('art') || katLower.includes('rumah tangga')) {
    prefix = 'ART';
  } else if (katLower.includes('baby') || katLower.includes('pengasuh')) {
    prefix = 'BS';
  } else if (katLower.includes('lansia') || katLower.includes('caregiver')) {
    prefix = 'PL';
  } else if (katLower.includes('driver')) {
    prefix = 'DR';
  } else if (katLower.includes('kebun')) {
    prefix = 'TK';
  } else if (katLower.includes('security')) {
    prefix = 'SC';
  } else if (katLower.includes('chef')) {
    prefix = 'CF';
  } else if (mainKategori) {
    prefix = mainKategori.split(' ').map(w => w[0]).join('').toUpperCase();
  }

  const existingNumbers = candidates
    .filter(c => c.id && c.id.toString().startsWith(prefix + '-'))
    .map(c => {
      const parts = c.id.toString().split('-');
      return parseInt(parts[1], 10) || 0;
    });

  const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  const nextNum = (maxNum + 1).toString().padStart(2, '0');

  return `${prefix}-${nextNum}`;
}

// ------------------- HELPER PARSE MULTI KATEGORI & GAJI -------------------
function parseKategoriAndGaji(kategoriRaw, gajiRaw) {
  let kategoriList = [];
  if (Array.isArray(kategoriRaw)) {
    kategoriList = kategoriRaw;
  } else if (typeof kategoriRaw === 'string' && kategoriRaw.trim() !== '') {
    try {
      kategoriList = JSON.parse(kategoriRaw);
      if (!Array.isArray(kategoriList)) kategoriList = [kategoriRaw];
    } catch (e) {
      kategoriList = kategoriRaw.includes(',') ? kategoriRaw.split(',').map(k => k.trim()) : [kategoriRaw];
    }
  }

  let gajiResult = {};
  if (typeof gajiRaw === 'object' && gajiRaw !== null && !Array.isArray(gajiRaw)) {
    gajiResult = gajiRaw;
  } else {
    try {
      const parsedGaji = typeof gajiRaw === 'string' ? JSON.parse(gajiRaw) : gajiRaw;
      if (typeof parsedGaji === 'object' && !Array.isArray(parsedGaji)) {
        gajiResult = parsedGaji;
      } else if (Array.isArray(parsedGaji)) {
        kategoriList.forEach((kat, idx) => {
          gajiResult[kat] = parseInt(parsedGaji[idx]) || 0;
        });
      } else {
        kategoriList.forEach(kat => {
          gajiResult[kat] = parseInt(parsedGaji) || 0;
        });
      }
    } catch (e) {
      kategoriList.forEach(kat => {
        gajiResult[kat] = parseInt(gajiRaw) || 0;
      });
    }
  }

  return { kategoriList, gajiResult };
}

// ------------------- MULTER CONFIG (UPLOAD FILE) -------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// =================================================================
// 🌐 1. ROUTING HALAMAN WEB
// =================================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/admin', (req, res) => {
  if (req.session && req.session.isAdmin) {
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
// 🔐 2. API AUTHENTICATION & KONTAK ADMIN
// =================================================================

app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.json({ success: true, isAdmin: true });
  }
  return res.json({ success: true, isAdmin: false });
});

app.get('/api/admin-wa', (req, res) => {
  res.json({ success: true, data: WA_ADMINS });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_ACCOUNT.username && password === ADMIN_ACCOUNT.password) {
    req.session.isAdmin = true;
    return res.json({ success: true, message: 'Login berhasil!' });
  }

  return res.status(401).json({ success: false, message: 'Username atau password salah!' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Gagal logout.' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Berhasil Logout' });
  });
});

// =================================================================
// 📋 3. API CANDIDATES
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

    const { kategoriList, gajiResult } = parseKategoriAndGaji(kategori, gaji);
    const newId = generateCategoryId(kategoriList, candidates);

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
      kategori: kategoriList,
      gaji: gajiResult,
      umur: parseInt(umur) || 0,
      asal: asal || '',
      keahlian: keahlian || '',
      pengalaman: parseInt(pengalaman) || 0,
      status: status || 'READY WORK',
      foto: fotoPath,
      fotoCv: fotoCvPath,
      createdAt: new Date().toISOString()
    };

    candidates.push(newCandidate);
    saveCandidates(candidates);

    res.json({ success: true, message: 'Data kandidat berhasil ditambahkan!', data: newCandidate });
  } catch (err) {
    console.error('Error POST candidate:', err.message);
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

    let updatedKategori = currentCandidate.kategori;
    let updatedGaji = currentCandidate.gaji;

    if (kategori !== undefined || gaji !== undefined) {
      const parsed = parseKategoriAndGaji(
        kategori !== undefined ? kategori : currentCandidate.kategori,
        gaji !== undefined ? gaji : currentCandidate.gaji
      );
      updatedKategori = parsed.kategoriList;
      updatedGaji = parsed.gajiResult;
    }

    candidates[index] = {
      ...currentCandidate,
      nama: nama !== undefined ? nama : currentCandidate.nama,
      noHp: noHp !== undefined ? noHp : currentCandidate.noHp,
      tinggi: tinggi ? parseInt(tinggi) : currentCandidate.tinggi,
      berat: berat ? parseInt(berat) : currentCandidate.berat,
      kategori: updatedKategori,
      gaji: updatedGaji,
      umur: umur ? parseInt(umur) : currentCandidate.umur,
      asal: asal !== undefined ? asal : currentCandidate.asal,
      keahlian: keahlian !== undefined ? keahlian : currentCandidate.keahlian,
      pengalaman: pengalaman ? parseInt(pengalaman) : currentCandidate.pengalaman,
      status: status !== undefined ? status : currentCandidate.status,
      foto: fotoPath,
      fotoCv: fotoCvPath,
      updatedAt: new Date().toISOString()
    };

    saveCandidates(candidates);
    res.json({ success: true, message: 'Data kandidat berhasil diperbarui!' });
  } catch (err) {
    console.error('Error PUT candidate:', err.message);
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
    console.error('Error PATCH status:', err.message);
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
    console.error('Error DELETE candidate:', err.message);
    res.status(500).json({ success: false, message: 'Gagal menghapus kandidat.' });
  }
});

// ------------------- RUN SERVER -------------------
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Server Berjalan di Port ${PORT}!`);
  console.log(`📂 Volume Storage Path: ${STORAGE_DIR}`);
  console.log(`==================================================`);
});
