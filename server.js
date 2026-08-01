const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Direktori penyimpanan file & JSON
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'candidates.json');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

// Config Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public'))); // Sesuaikan dengan folder statis Anda

// Auth Middleware (Dummy / Sesuaikan dengan auth admin Anda)
const authAdmin = (req, res, next) => {
  // Jika menggunakan session/cookie, cek autentikasi di sini
  next();
};

// Helper Read/Write Data JSON
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

// ------------------- API ROUTES -------------------

// 1. GET ALL CANDIDATES
app.get('/api/candidates', (req, res) => {
  const candidates = getCandidates();
  res.json(candidates);
});

// 2. CREATE NEW CANDIDATE (POST)
app.post('/api/candidates', authAdmin, upload.fields([
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
      fotoCvPath = fotoPath; // Fallback jika CV tidak diunggah
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
    res.status(500).json({ success: false, message: 'Gagal menambahkan data kandidat.' });
  }
});

// 3. EDIT CANDIDATE LENGKAP (PUT)
app.put('/api/candidates/:id', authAdmin, upload.fields([
  { name: 'foto', maxCount: 1 },
  { name: 'fotoCv', maxCount: 1 }
]), (req, res) => {
  try {
    const { id } = req.params;
    const { nama, umur, asal, keahlian, pengalaman, gaji, kategori, status, noHp, tinggi, berat } = req.body;

    const candidates = getCandidates();
    const index = candidates.findIndex(c => c.id === id);

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Kandidat tidak ditemukan.' });
    }

    const currentCandidate = candidates[index];

    // Cek jika ada foto profil baru
    let fotoPath = currentCandidate.foto;
    if (req.files && req.files.foto && req.files.foto[0]) {
      if (currentCandidate.foto && currentCandidate.foto.startsWith('/uploads/')) {
        const oldFile = path.join(UPLOAD_DIR, currentCandidate.foto.replace('/uploads/', ''));
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }
      fotoPath = `/uploads/${req.files.foto[0].filename}`;
    }

    // Cek jika ada file CV baru
    let fotoCvPath = currentCandidate.fotoCv;
    if (req.files && req.files.fotoCv && req.files.fotoCv[0]) {
      if (currentCandidate.fotoCv && currentCandidate.fotoCv.startsWith('/uploads/') && currentCandidate.fotoCv !== currentCandidate.foto) {
        const oldCvFile = path.join(UPLOAD_DIR, currentCandidate.fotoCv.replace('/uploads/', ''));
        if (fs.existsSync(oldCvFile)) fs.unlinkSync(oldCvFile);
      }
      fotoCvPath = `/uploads/${req.files.fotoCv[0].filename}`;
    }

    // Update Data
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

// 4. UPDATE STATUS QUICK ACTION (PATCH)
app.patch('/api/candidates/:id/status', authAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const candidates = getCandidates();
    const index = candidates.findIndex(c => c.id === id);

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

// 5. DELETE CANDIDATE (DELETE)
app.delete('/api/candidates/:id', authAdmin, (req, res) => {
  try {
    const { id } = req.params;
    let candidates = getCandidates();
    const target = candidates.find(c => c.id === id);

    if (target) {
      // Hapus foto dari server
      if (target.foto && target.foto.startsWith('/uploads/')) {
        const file = path.join(UPLOAD_DIR, target.foto.replace('/uploads/', ''));
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
      if (target.fotoCv && target.fotoCv.startsWith('/uploads/') && target.fotoCv !== target.foto) {
        const cvFile = path.join(UPLOAD_DIR, target.fotoCv.replace('/uploads/', ''));
        if (fs.existsSync(cvFile)) fs.unlinkSync(cvFile);
      }
    }

    candidates = candidates.filter(c => c.id !== id);
    saveCandidates(candidates);

    res.json({ success: true, message: 'Kandidat berhasil dihapus!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menghapus kandidat.' });
  }
});

// 6. LOGOUT API
app.post('/api/logout', (req, res) => {
  res.json({ success: true, message: 'Logout berhasil' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
