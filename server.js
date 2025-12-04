// Servidor de comentarios para Apleno Verdulería
// Base de datos: SQLite (persistente en disco)
// Endpoints:
//   GET  /api/health        -> estado del servidor
//   GET  /api/comments      -> lista de comentarios (ordenados por fecha desc.)
//   POST /api/comments      -> crear comentario { name, email, message }

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT || 3000;

// Asegurar carpeta de datos
const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Ruta del archivo de base de datos
const DB_PATH = path.join(DATA_DIR, 'comments.db');

// Inicializar DB
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      message TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

// Util: limpieza básica de strings para evitar inyecciones de HTML al devolver
function sanitize(str = ''){
  return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: !!db, message: 'Apleno API funcionando' });
});

// Listar comentarios
app.get('/api/comments', (req, res) => {
  db.all(
    `SELECT id, name, email, message, date FROM comments ORDER BY datetime(date) DESC, id DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error('DB get error:', err);
        return res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }
      const safe = rows.map(r => ({
        id: r.id,
        name: r.name || 'Anónimo',
        email: r.email || '',
        message: sanitize(r.message),
        date: r.date
      }));
      res.json({ ok: true, items: safe });
    }
  );
});

// Crear comentario
app.post('/api/comments', (req, res) => {
  const name = (req.body.name || '').toString().trim().slice(0, 100);
  const email = (req.body.email || '').toString().trim().slice(0, 150);
  const message = (req.body.message || '').toString().trim();

  if (!message || message.length < 5) {
    return res.status(400).json({ ok: false, error: 'VALIDATION_MIN_LENGTH', field: 'message' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ ok: false, error: 'VALIDATION_MAX_LENGTH', field: 'message' });
  }

  const date = new Date().toISOString();

  const sql = `INSERT INTO comments (name, email, message, date) VALUES (?, ?, ?, ?)`;
  db.run(sql, [name, email, message, date], function(err){
    if (err) {
      console.error('DB insert error:', err);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
    const id = this.lastID;
    res.status(201).json({ ok: true, item: { id, name: name || 'Anónimo', email, message: sanitize(message), date } });
  });
});

app.listen(PORT, () => {
  console.log(`Apleno API escuchando en http://localhost:${PORT}`);
});
