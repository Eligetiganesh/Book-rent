const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// SQLite database setup
const dbPath = path.resolve(__dirname, 'bookrental.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      userType TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      googleBooksId TEXT,
      title TEXT,
      authors TEXT,
      description TEXT,
      imageUrl TEXT,
      renterId INTEGER,
      rentalPrice REAL,
      rentalDuration INTEGER
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS rentals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookId INTEGER,
      userId INTEGER,
      rentalDate TEXT,
      returnDate TEXT,
      FOREIGN KEY (bookId) REFERENCES books (id),
      FOREIGN KEY (userId) REFERENCES users (id)
    )`);
  }
});

// Google Books API
const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';

app.get('/api/search', async (req, res) => {
  const { query } = req.query;
  try {
    // Search local database
    const dbBooks = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM books WHERE title LIKE ? OR authors LIKE ?`, [`%${query}%`, `%${query}%`], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Search Google Books API
    const googleResponse = await axios.get(`${GOOGLE_BOOKS_API}?q=${query}`);
    const googleBooks = googleResponse.data.items.map(item => ({
      id: item.id,
      title: item.volumeInfo.title,
      authors: item.volumeInfo.authors ? item.volumeInfo.authors.join(', ') : 'Unknown',
      description: item.volumeInfo.description,
      imageUrl: item.volumeInfo.imageLinks?.thumbnail,
      isGoogleBook: true
    }));

    // Combine and send results
    const combinedBooks = [...dbBooks, ...googleBooks];
    res.json(combinedBooks);
  } catch (error) {
    console.error('Error searching books:', error);
    res.status(500).json({ error: 'Error searching books' });
  }
});

app.post('/api/books', (req, res) => {
  const { googleBooksId, title, authors, description, imageUrl, renterId, rentalPrice, rentalDuration } = req.body;
  const sql = `INSERT INTO books (googleBooksId, title, authors, description, imageUrl, renterId, rentalPrice, rentalDuration) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [googleBooksId, title, authors, description, imageUrl, renterId, rentalPrice, rentalDuration], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({ id: this.lastID, ...req.body });
  });
});

app.get('/api/books', (req, res) => {
  const sql = `SELECT * FROM books`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/users/register', (req, res) => {
  const { username, password, userType } = req.body;
  const sql = `INSERT INTO users (username, password, userType) VALUES (?, ?, ?)`;
  db.run(sql, [username, password, userType], function(err) {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(201).json({ id: this.lastID, username, userType });
  });
});

app.post('/api/users/login', (req, res) => {
  const { username, password } = req.body;
  const sql = `SELECT id, username, userType FROM users WHERE username = ? AND password = ?`;
  db.get(sql, [username, password], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (row) {
      res.json(row);
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });
});

app.post('/api/rentals', (req, res) => {
  const { bookId, userId, rentalDate, returnDate } = req.body;
  const sql = `INSERT INTO rentals (bookId, userId, rentalDate, returnDate) VALUES (?, ?, ?, ?)`;
  db.run(sql, [bookId, userId, rentalDate, returnDate], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.status(201).json({ id: this.lastID, ...req.body });
  });
});

app.get('/api/rentals/:userId', (req, res) => {
  const { userId } = req.params;
  const sql = `
    SELECT r.*, b.title, b.authors, b.imageUrl, b.rentalPrice, b.rentalDuration
    FROM rentals r
    JOIN books b ON r.bookId = b.id
    WHERE r.userId = ?
  `;
  db.all(sql, [userId], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));