const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 5000;
const STREAM_URL = 'https://d3d4yli4hf5bmh.cloudfront.net/hls/live.m3u8';

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/radio', (req, res) => {
  res.render('radio', { streamUrl: STREAM_URL });
});

app.get('/', (req, res) => {
  db.all('SELECT id, name, created_at FROM items ORDER BY id DESC', [], (err, items) => {
    if (err) return res.status(500).send(err.message);
    res.render('index', { items });
  });
});

app.post('/items', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.redirect('/');
  db.run('INSERT INTO items (name) VALUES (?)', [name], (err) => {
    if (err) return res.status(500).send(err.message);
    res.redirect('/');
  });
});

app.post('/items/:id/delete', (req, res) => {
  db.run('DELETE FROM items WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).send(err.message);
    res.redirect('/');
  });
});

app.listen(PORT, () => {
  console.log(`RadioCalico prototype running at http://127.0.0.1:${PORT}`);
});
