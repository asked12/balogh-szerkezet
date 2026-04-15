const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const compression = require('compression');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(cors());
app.use(express.json());
// Admin védelem (a statikus fájlok elé)
app.use('/admin.html', (req, res, next) => {
    const auth = req.headers.authorization;
    const expected = 'Basic ' + Buffer.from('admin:galeria').toString('base64');
    if (auth === expected) return next();
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    res.status(401).send('Hozzáférés megtagadva');
});



// Statikus fájlok
app.use(express.static(path.join(__dirname, '../public'), { maxAge: '7d', etag: true, lastModified: true }));

// ========== ADATBÁZIS VÁLASZTÁS (SQLite helyben, PostgreSQL Renderen) ==========
let db;

if (process.env.DATABASE_URL) {
    // PostgreSQL (Renderen)
    const { Pool } = require('pg');
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    db = {
        query: (text, params) => pool.query(text, params),
        get: (sql, params) => pool.query(sql, params).then(res => res.rows[0]),
        all: (sql, params) => pool.query(sql, params).then(res => res.rows),
        run: (sql, params) => pool.query(sql, params)
    };
    console.log('✅ PostgreSQL használata (Render)');
} else {
    // SQLite (helyi fejlesztés)
    const sqlite3 = require('sqlite3').verbose();
    const sqliteDb = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));
    db = {
        query: (sql, params) => {
            return new Promise((resolve, reject) => {
                if (sql.toLowerCase().trim().startsWith('select')) {
                    sqliteDb.all(sql, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve({ rows });
                    });
                } else {
                    sqliteDb.run(sql, params, function(err) {
                        if (err) reject(err);
                        else resolve({ rows: [], lastID: this.lastID });
                    });
                }
            });
        },
        get: (sql, params) => new Promise((resolve, reject) => {
            sqliteDb.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        }),
        all: (sql, params) => new Promise((resolve, reject) => {
            sqliteDb.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        }),
        run: (sql, params) => new Promise((resolve, reject) => {
            sqliteDb.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID });
            });
        }),
        serialize: (fn) => sqliteDb.serialize(fn)
    };
    console.log('✅ SQLite használata (helyi fejlesztés)');
}

// ========== ADATBÁZIS INICIALIZÁLÁS ==========
async function initDB() {
    try {
        if (process.env.DATABASE_URL) {
            // PostgreSQL táblák
            await db.query(`
                CREATE TABLE IF NOT EXISTS reviews (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    service TEXT NOT NULL,
                    stars INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    date TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await db.query(`
                CREATE TABLE IF NOT EXISTS contacts (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            const res = await db.query('SELECT COUNT(*) FROM reviews');
            const count = parseInt(res.rows[0].count);
            console.log('Jelenlegi vélemények száma (PG):', count);
            if (count === 0) {
                const defaults = [
                    { name: "Kovács János", service: "Új épületek", stars: 5, text: "Kulcsrakész házunk tökéletes lett. Nagyon elégedettek vagyunk a munkájukkal!", date: "2026.03.15" },
                    { name: "Nagy Anna", service: "Felújítás", stars: 5, text: "A felújítás gyors és precíz volt. Az otthonunk most sokkal modernebb.", date: "2026.02.28" },
                    { name: "Tóth Péter", service: "Tervezés", stars: 4, text: "Segítőkész tervezők, gyors engedélyeztetés. Köszönjük!", date: "2026.03.01" },
                    { name: "Szabó Mária", service: "Új épületek", stars: 5, text: "Csak ajánlani tudom őket! Profi munka, pontos határidők.", date: "2026.03.10" },
                    { name: "Kiss Gábor", service: "Felújítás", stars: 5, text: "A fürdőszoba felújítás hibátlan lett. Mindenkinek ajánlom!", date: "2026.02.20" },
                    { name: "Varga Edit", service: "Tervezés", stars: 5, text: "Gyors és pontos munkát végeztek, az engedélyeztetés zökkenőmentes volt.", date: "2026.03.05" }
                ];
                for (const r of defaults) {
                    await db.query(
                        'INSERT INTO reviews (name, service, stars, text, date) VALUES ($1, $2, $3, $4, $5)',
                        [r.name, r.service, r.stars, r.text, r.date]
                    );
                    console.log(`✅ Beszúrva: ${r.name}`);
                }
                console.log('✅ Alapértelmezett vélemények betöltve');
            }
        } else {
            // SQLite táblák
            db.serialize(() => {
                db.run(`CREATE TABLE IF NOT EXISTS reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    service TEXT NOT NULL,
                    stars INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    date TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) console.error('Hiba a reviews tábla létrehozásakor:', err.message);
                    else console.log('✅ reviews tábla ellenőrizve/létrehozva');
                });
                db.run(`CREATE TABLE IF NOT EXISTS contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) console.error('Hiba a contacts tábla létrehozásakor:', err.message);
                    else console.log('✅ contacts tábla ellenőrizve/létrehozva');
                });
                db.get('SELECT COUNT(*) as count FROM reviews', (err, row) => {
                    if (err) return console.error('Hiba a lekéréskor:', err.message);
                    console.log('Jelenlegi vélemények száma:', row?.count || 0);
                    if (!row || row.count === 0) {
                        const defaults = [
                            { name: "Kovács János", service: "Új épületek", stars: 5, text: "Kulcsrakész házunk tökéletes lett. Nagyon elégedettek vagyunk a munkájukkal!", date: "2026.03.15" },
                            { name: "Nagy Anna", service: "Felújítás", stars: 5, text: "A felújítás gyors és precíz volt. Az otthonunk most sokkal modernebb.", date: "2026.02.28" },
                            { name: "Tóth Péter", service: "Tervezés", stars: 4, text: "Segítőkész tervezők, gyors engedélyeztetés. Köszönjük!", date: "2026.03.01" },
                            { name: "Szabó Mária", service: "Új épületek", stars: 5, text: "Csak ajánlani tudom őket! Profi munka, pontos határidők.", date: "2026.03.10" },
                            { name: "Kiss Gábor", service: "Felújítás", stars: 5, text: "A fürdőszoba felújítás hibátlan lett. Mindenkinek ajánlom!", date: "2026.02.20" },
                            { name: "Varga Edit", service: "Tervezés", stars: 5, text: "Gyors és pontos munkát végeztek, az engedélyeztetés zökkenőmentes volt.", date: "2026.03.05" }
                        ];
                        defaults.forEach(r => {
                            db.run('INSERT INTO reviews (name, service, stars, text, date) VALUES (?, ?, ?, ?, ?)',
                                [r.name, r.service, r.stars, r.text, r.date], function(err3) {
                                    if (err3) console.error('Hiba beszúráskor:', err3.message);
                                    else console.log(`✅ Beszúrva: ${r.name}`);
                                });
                        });
                        console.log('✅ Alapértelmezett vélemények betöltése folyamatban...');
                    }
                });
            });
        }
    } catch (err) {
        console.error('DB init error:', err);
    }
}
initDB();

// ========== EMAIL BEÁLLÍTÁSOK ==========
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});
const EMAIL_TO = process.env.EMAIL_TO || 'tomibt66@gmail.com';

// Galéria mappa (a public/gallery mappában)
const galleryDir = path.join(__dirname, '../public/gallery');
if (!fs.existsSync(galleryDir)) {
    fs.mkdirSync(galleryDir, { recursive: true });
}

// Multer beállítás – csak képek fogadása
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, galleryDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, unique + ext);
    }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // max 5MB

// ========== ADMIN HITELESÍTÉS ==========
const adminAuth = (req, res, next) => {
    const auth = req.headers.authorization;
    const expected = 'Basic ' + Buffer.from('admin:galeria').toString('base64');
    if (auth === expected) return next();
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
    res.status(401).json({ error: 'Unauthorized' });
};

// ========== API ENDPOINTOK ==========

app.get('/api/reviews', async (req, res) => {
    try {
        let rows;
        if (process.env.DATABASE_URL) {
            const result = await db.query('SELECT * FROM reviews ORDER BY created_at DESC');
            rows = result.rows;
        } else {
            rows = await db.all('SELECT * FROM reviews ORDER BY created_at DESC', []);
        }
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reviews', async (req, res) => {
    const { name, service, stars, text } = req.body;
    const date = new Date().toLocaleDateString('hu-HU');
    try {
        let id;
        if (process.env.DATABASE_URL) {
            const result = await db.query(
                'INSERT INTO reviews (name, service, stars, text, date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [name, service, stars, text, date]
            );
            id = result.rows[0].id;
        } else {
            const result = await db.run(
                'INSERT INTO reviews (name, service, stars, text, date) VALUES (?, ?, ?, ?, ?)',
                [name, service, stars, text, date]
            );
            id = result.lastID;
        }
        res.json({ id, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contact', async (req, res) => {
    const { name, email, phone, message } = req.body;
    try {
        if (process.env.DATABASE_URL) {
            await db.query(
                'INSERT INTO contacts (name, email, phone, message) VALUES ($1, $2, $3, $4)',
                [name, email, phone, message]
            );
        } else {
            await db.run(
                'INSERT INTO contacts (name, email, phone, message) VALUES (?, ?, ?, ?)',
                [name, email, phone, message]
            );
        }
        try {
            await transporter.sendMail({
                from: `"Balogh Szerkezet" <${process.env.SMTP_USER}>`,
                to: EMAIL_TO,
                subject: `📩 Új üzenet - ${name}`,
                html: `<h2>Új kapcsolatfelvétel</h2><p><strong>Név:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Telefon:</strong> ${phone}</p><p><strong>Üzenet:</strong></p><p>${message.replace(/\n/g, '<br>')}</p>`
            });
            res.json({ success: true, message: 'Email elküldve!' });
        } catch (emailErr) {
            console.error('Email error:', emailErr);
            res.json({ success: true, message: 'Üzenet mentve, de az email nem ment ki!' });
        }
    } catch (err) {
        console.error('DB error:', err);
        res.status(500).json({ success: false, message: 'Adatbázis hiba' });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        let total_reviews, avg_rating;
        if (process.env.DATABASE_URL) {
            const result = await db.query('SELECT COUNT(*) as total_reviews, AVG(stars) as avg_rating FROM reviews');
            const row = result.rows[0];
            total_reviews = parseInt(row.total_reviews) || 0;
            avg_rating = (parseFloat(row.avg_rating) || 0).toFixed(1);
        } else {
            const row = await db.get('SELECT COUNT(*) as total_reviews, AVG(stars) as avg_rating FROM reviews', []);
            total_reviews = row?.total_reviews || 0;
            avg_rating = (row?.avg_rating || 0).toFixed(1);
        }
        res.json({ total_reviews, avg_rating });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1. Képek listájának lekérése (nyilvános)
app.get('/api/gallery', (req, res) => {
    fs.readdir(galleryDir, (err, files) => {
        if (err) return res.status(500).json({ error: err.message });
        const images = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
        res.json(images);
    });
});

// 2. Kép feltöltése (admin)
app.post('/api/upload', adminAuth, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Nincs fájl' });
    res.json({ success: true, filename: req.file.filename });
});

// 3. Kép törlése (admin)
app.delete('/api/gallery/:filename', adminAuth, (req, res) => {
    const filePath = path.join(galleryDir, req.params.filename);
    fs.unlink(filePath, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.listen(PORT, () => {
    console.log(`✅ Backend fut: http://localhost:${PORT}`);
    console.log(`📧 Email beállítva: ${EMAIL_TO}`);
});