const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;

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

// Matikan cache agar data kandidat baru langsung muncul
app.use('/api/candidates', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Serve folder uploads
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

// API Logout Admin
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Gagal logout' });
    }
    res.clearCookie('connect.sid'); // Hapus cookie session
    res.json({ success: true, message: 'Berhasil logout' });
  });
});

// API Cek Status Login
app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.json({ isAdmin: true });
  } else {
    res.json({ isAdmin: false });
  }
});

// API Ambil Semua Data Kandidat (DIFILTER BERDASARKAN STATUS ADMIN)
app.get('/api/candidates', (req, res) => {
  const candidates = getCandidates();
  const isAdmin = req.session && req.session.isAdmin;

  // Filter data noHp jika bukan admin
  const responseData = candidates.map(item => {
    const candidateData = { ...item };
    if (!isAdmin) {
      delete candidateData.noHp; // Hapus properti noHp jika BUKAN Admin
    }
    return candidateData;
  });

  res.json(responseData);
});

// Setup Multer untuk Upload Gambar
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

// API Tambah Kandidat Baru (ID OTOMATIS BERDASARKAN KATEGORI)
app.post('/api/candidates', authAdmin, upload.fields([
  { name: 'foto', maxCount: 1 },
  { name: 'fotoCv', maxCount: 1 }
]), (req, res) => {
  try {
    const { nama, umur, asal, keahlian, pengalaman, gaji, kategori, status, noHp, tinggi, berat } = req.body;

    if (!req.files || !req.files.foto) {
      return res.status(400).json({ success: false, message: 'Foto kandidat wajib diupload!' });
    }

    const candidates = getCandidates();

    // 📍 1. TENTUKAN KODE AWALAN (PREFIX) BERDASARKAN KATEGORI
    let prefix = 'KND';
    const katUpper = (kategori || '').toUpperCase();

    if (katUpper.includes('ART') || katUpper.includes('ASISTEN')) {
      prefix = 'ART';
    } else if (katUpper.includes('BABY') || katUpper.includes('SITTER') || katUpper.includes('PENGASUH')) {
      prefix = 'BS';
    } else if (katUpper.includes('PERAWAT') || katUpper.includes('LANSIA') || katUpper.includes('CAREGIVER')) {
      prefix = 'PL';
    } else if (katUpper.includes('DRIVER')) {
      prefix = 'DRV';
    } else if (katUpper.includes('KEBUN')) {
      prefix = 'TKB';
    } else if (katUpper.includes('SECURITY')) {
      prefix = 'SEC';
    }

    // 📍 2. HITUNG KANDIDAT YANG SUDAH ADA DENGAN PREFIX SAMA UNTUK PENOMORAN URUT
    const countSamePrefix = candidates.filter(c => c.id && c.id.startsWith(prefix)).length;
    const nextNumber = String(countSamePrefix + 1).padStart(2, '0'); // Contoh: 1 -> "01", 2 -> "02"
    const generatedId = `${prefix}-${nextNumber}`;

    const fotoPath = `/uploads/${req.files.foto[0].filename}`;
    const fotoCvPath = (req.files.fotoCv && req.files.fotoCv[0]) 
      ? `/uploads/${req.files.fotoCv[0].filename}` 
      : fotoPath;

    const newCandidate = {
      id: generatedId, // ID Otomatis (misal: ART-01, BS-01)
      nama,
      noHp: noHp || '-',
      tinggi: parseInt(tinggi) || 0,
      berat: parseInt(berat) || 0,
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

    res.json({ success: true, message: 'Kandidat berhasil ditambahkan!', candidate: newCandidate });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menyimpan data kandidat.' });
  }
});

// API Ubah Status Kandidat
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

    candidates[index].status = status;
    saveCandidates(candidates);

    res.json({ success: true, message: 'Status kandidat berhasil diperbarui!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal memperbarui status.' });
  }
});

// API Hapus Kandidat
app.delete('/api/candidates/:id', authAdmin, (req, res) => {
  const { id } = req.params;
  let candidates = getCandidates();
  
  const candidate = candidates.find(c => c.id === id);
  if (candidate) {
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

// ----------------------------------------------------
// 5. JALANKAN SERVER
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Server Yayasan Aktif di Port: ${PORT}`);
  console.log(`=================================`);
});
