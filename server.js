const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const app = express();
const PORT = 3000;
const db = new DatabaseSync(path.join(__dirname, 'drill.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date TEXT NOT NULL,
    session_time TEXT NOT NULL,
    correct_count INTEGER NOT NULL,
    total_count INTEGER NOT NULL,
    accuracy REAL NOT NULL,
    elapsed_seconds REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS question_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    question_num INTEGER NOT NULL,
    num1 INTEGER NOT NULL,
    num2 INTEGER NOT NULL,
    correct_answer INTEGER NOT NULL,
    user_answer INTEGER NOT NULL,
    is_correct INTEGER NOT NULL,
    time_seconds REAL NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
`);

const insertSession = db.prepare(
  `INSERT INTO sessions (session_date, session_time, correct_count, total_count, accuracy, elapsed_seconds)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const insertQ = db.prepare(
  `INSERT INTO question_details (session_id, question_num, num1, num2, correct_answer, user_answer, is_correct, time_seconds)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/session', (req, res) => {
  const { date, time, correct_count, total_count, accuracy, elapsed_seconds, questions } = req.body;
  try {
    const r = insertSession.run(date, time, correct_count, total_count, accuracy, elapsed_seconds);
    const sid = r.lastInsertRowid;
    (questions || []).forEach((q, i) => {
      insertQ.run(sid, i + 1, q.num1, q.num2, q.correct, q.userAnswer, q.isCorrect ? 1 : 0, q.timeSpent);
    });
    res.json({ success: true, id: sid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/best', (req, res) => {
  const best = db.prepare(
    `SELECT * FROM sessions WHERE accuracy = 100 ORDER BY elapsed_seconds ASC LIMIT 1`
  ).get();
  res.json(best || null);
});

app.get('/api/history', (req, res) => {
  const rows = db.prepare(
    `SELECT * FROM sessions ORDER BY created_at DESC LIMIT 10`
  ).all();
  res.json(rows);
});

app.listen(PORT, () => {
  console.log(`✅ さんすうドリル起動中 → http://localhost:${PORT}`);
});
