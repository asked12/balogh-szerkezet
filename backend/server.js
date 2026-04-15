const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const compression = require('compression');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'), { maxAge: '7d', etag: true, lastModified: true }));

// PostgreSQL kapcsolat
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Adatbázis inicializálás (táblák, alapértelmezett vélemények)
async function initDB() {
    try {
        await pool.query(`
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
        console.log('✅ reviews tábla ellenőrizve/létrehozva');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS contacts (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ contacts tábla ellenőrizve/létrehozva');

        const res = await pool.query('SELECT COUNT(*) FROM reviews');
        const count = parseInt(res.rows[0].count);
        console.log('Jelenlegi vélemények száma:', count);

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
                await pool.query(
                    'INSERT INTO reviews (name, service, stars, text, date) VALUES ($1, $2, $3, $4, $5)',
                    [r.name, r.service, r.stars, r.text, r.date]
                );
                console.log(`✅ Beszúrva: ${r.name}`);
            }
            console.log('✅ Alapértelmezett vélemények betöltve');
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

// ========== API ENDPOINTOK ==========

app.get('/api/reviews', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM reviews ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reviews', async (req, res) => {
    const { name, service, stars, text } = req.body;
    const date = new Date().toLocaleDateString('hu-HU');
    try {
        const result = await pool.query(
            'INSERT INTO reviews (name, service, stars, text, date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, service, stars, text, date]
        );
        res.json({ id: result.rows[0].id, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/contact', async (req, res) => {
    const { name, email, phone, message } = req.body;
    try {
        await pool.query(
            'INSERT INTO contacts (name, email, phone, message) VALUES ($1, $2, $3, $4)',
            [name, email, phone, message]
        );
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
        const result = await pool.query('SELECT COUNT(*) as total_reviews, AVG(stars) as avg_rating FROM reviews');
        const row = result.rows[0];
        res.json({
            total_reviews: parseInt(row.total_reviews) || 0,
            avg_rating: (parseFloat(row.avg_rating) || 0).toFixed(1)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`📧 Email beállítva: ${EMAIL_TO}`);
});