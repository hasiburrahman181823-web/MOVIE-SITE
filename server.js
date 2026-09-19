require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
const { sign, auth, adminOnly } = require('./auth');

const app = express();
const PORT = process.env.PORT || 5000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const maxMB = Number(process.env.MAX_UPLOAD_MB || 2048);
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: maxMB * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/');
    cb(ok ? null : new Error('Only video or image files are allowed'), ok);
  }
});

app.get('/api/health', (_, res) => res.json({ ok: true, service: 'CineNova+' }));

app.get('/api/movies', (req, res) => {
  const { q = '', genre = '', status = 'published' } = req.query;
  let sql = 'SELECT * FROM movies WHERE 1=1';
  const args = [];
  if (status !== 'all') { sql += ' AND status=?'; args.push(status); }
  if (genre) { sql += ' AND genre=?'; args.push(genre); }
  if (q) { sql += ' AND (title LIKE ? OR description LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...args));
});

app.get('/api/movies/:id', (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id=?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  res.json(movie);
});

app.post('/api/register', (req, res) => {
  const bcrypt = require('bcryptjs');
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Valid name, email and 6+ character password required' });
  try {
    const hash = bcrypt.hashSync(password, 12);
    const info = db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name, email.toLowerCase(), hash);
    res.json({ token: sign({ id: Number(info.lastInsertRowid), role: 'user' }), user: { id: Number(info.lastInsertRowid), name, email, role: 'user' } });
  } catch { res.status(409).json({ error: 'Email already registered' }); }
});

app.post('/api/login', (req, res) => {
  const bcrypt = require('bcryptjs');
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !bcrypt.compareSync(req.body.password || '', user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: sign({ id: user.id, role: user.role }), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/me', auth, (req, res) => {
  res.json(db.prepare('SELECT id,name,email,role,created_at FROM users WHERE id=?').get(req.user.id));
});

app.get('/api/my-list', auth, (req, res) => {
  res.json(db.prepare('SELECT m.* FROM movies m JOIN watchlist w ON w.movie_id=m.id WHERE w.user_id=? ORDER BY w.rowid DESC').all(req.user.id));
});
app.post('/api/my-list/:movieId', auth, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO watchlist(user_id,movie_id) VALUES(?,?)').run(req.user.id, req.params.movieId);
  res.json({ ok: true });
});
app.delete('/api/my-list/:movieId', auth, (req, res) => {
  db.prepare('DELETE FROM watchlist WHERE user_id=? AND movie_id=?').run(req.user.id, req.params.movieId);
  res.json({ ok: true });
});



// Demo-ready personalisation, ratings, progress and subscription endpoints
app.get('/api/movies/:id/ratings', (req, res) => {
  const summary = db.prepare('SELECT ROUND(AVG(rating),1) average, COUNT(*) count FROM ratings WHERE movie_id=?').get(req.params.id);
  const reviews = db.prepare('SELECT r.rating,r.review,r.created_at,u.name FROM ratings r JOIN users u ON u.id=r.user_id WHERE r.movie_id=? ORDER BY r.created_at DESC').all(req.params.id);
  res.json({ summary, reviews });
});
app.post('/api/movies/:id/ratings', auth, (req, res) => {
  const rating = Number(req.body.rating);
  const review = String(req.body.review || '').slice(0, 1000);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({error:'Rating must be between 1 and 5'});
  db.prepare(`INSERT INTO ratings(user_id,movie_id,rating,review) VALUES(?,?,?,?)
    ON CONFLICT(user_id,movie_id) DO UPDATE SET rating=excluded.rating,review=excluded.review,created_at=CURRENT_TIMESTAMP`).run(req.user.id, req.params.id, rating, review);
  res.json({ok:true});
});
app.get('/api/progress', auth, (req,res)=>res.json(db.prepare('SELECT p.*,m.title,m.poster_url FROM progress p JOIN movies m ON m.id=p.movie_id WHERE p.user_id=? ORDER BY p.updated_at DESC').all(req.user.id)));
app.post('/api/progress/:movieId', auth, (req,res)=>{
  const seconds=Math.max(0,Number(req.body.seconds)||0), completed=req.body.completed?1:0;
  db.prepare(`INSERT INTO progress(user_id,movie_id,seconds,completed) VALUES(?,?,?,?)
    ON CONFLICT(user_id,movie_id) DO UPDATE SET seconds=excluded.seconds,completed=excluded.completed,updated_at=CURRENT_TIMESTAMP`).run(req.user.id,req.params.movieId,seconds,completed);
  res.json({ok:true});
});
app.get('/api/profile', auth, (req,res)=>{
  const user=db.prepare('SELECT id,name,email,role,created_at FROM users WHERE id=?').get(req.user.id);
  const profile=db.prepare('SELECT * FROM profiles WHERE user_id=?').get(req.user.id) || {avatar_url:'',bio:'',preferences:'{}'};
  res.json({...user,...profile});
});
app.put('/api/profile', auth, (req,res)=>{
  const name=String(req.body.name||'').trim(); const bio=String(req.body.bio||'').slice(0,500); const avatar_url=String(req.body.avatar_url||'').slice(0,1000);
  if(!name) return res.status(400).json({error:'Name is required'});
  db.prepare('UPDATE users SET name=? WHERE id=?').run(name,req.user.id);
  db.prepare(`INSERT INTO profiles(user_id,avatar_url,bio) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET avatar_url=excluded.avatar_url,bio=excluded.bio`).run(req.user.id,avatar_url,bio);
  res.json({ok:true});
});
app.get('/api/subscription', auth, (req,res)=>res.json(db.prepare('SELECT * FROM subscriptions WHERE user_id=? ORDER BY id DESC').all(req.user.id)));
app.post('/api/subscription/checkout', auth, (req,res)=>{
  const plan=['Basic','Standard','Premium'].includes(req.body.plan)?req.body.plan:'Standard';
  const expires=new Date(Date.now()+30*86400000).toISOString();
  const info=db.prepare('INSERT INTO subscriptions(user_id,plan,status,expires_at) VALUES(?,?,?,?)').run(req.user.id,plan,'demo-active',expires);
  res.json({ok:true,demo:true,message:'Demo subscription activated. No real payment was charged.',subscription:db.prepare('SELECT * FROM subscriptions WHERE id=?').get(info.lastInsertRowid)});
});

app.get('/api/admin/stats', auth, adminOnly, (_, res) => {
  const stats = {
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    movies: db.prepare('SELECT COUNT(*) c FROM movies').get().c,
    published: db.prepare("SELECT COUNT(*) c FROM movies WHERE status='published'").get().c,
    drafts: db.prepare("SELECT COUNT(*) c FROM movies WHERE status='draft'").get().c,
    views: db.prepare('SELECT COALESCE(SUM(views),0) c FROM movies').get().c,
    storageFiles: fs.readdirSync(UPLOAD_DIR).filter(x => x !== '.gitkeep').length
  };
  res.json(stats);
});

app.get('/api/admin/users', auth, adminOnly, (_, res) => {
  res.json(db.prepare('SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC').all());
});

app.post('/api/admin/movies', auth, adminOnly, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]), (req, res) => {
  const b = req.body;
  const video = req.files?.video?.[0];
  const poster = req.files?.poster?.[0];
  const info = db.prepare(`INSERT INTO movies
    (title,description,genre,year,duration,poster_url,video_url,video_path,status)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(
      b.title, b.description || '', b.genre || 'Drama', b.year || null, b.duration || '',
      poster ? `/uploads/${poster.filename}` : (b.poster_url || ''),
      b.video_url || '', video ? video.filename : '', b.status || 'published'
    );
  res.json(db.prepare('SELECT * FROM movies WHERE id=?').get(info.lastInsertRowid));
});

app.put('/api/admin/movies/:id', auth, adminOnly, upload.fields([{ name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]), (req, res) => {
  const old = db.prepare('SELECT * FROM movies WHERE id=?').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Movie not found' });
  const b = req.body, video = req.files?.video?.[0], poster = req.files?.poster?.[0];
  const nextVideoPath = video ? video.filename : old.video_path;
  const nextPoster = poster ? `/uploads/${poster.filename}` : (b.poster_url ?? old.poster_url);
  db.prepare(`UPDATE movies SET title=?,description=?,genre=?,year=?,duration=?,poster_url=?,video_url=?,video_path=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(b.title ?? old.title, b.description ?? old.description, b.genre ?? old.genre, b.year || null, b.duration ?? old.duration, nextPoster, b.video_url ?? old.video_url, nextVideoPath, b.status ?? old.status, req.params.id);
  if (video && old.video_path) fs.rmSync(path.join(UPLOAD_DIR, old.video_path), { force: true });
  res.json(db.prepare('SELECT * FROM movies WHERE id=?').get(req.params.id));
});

app.delete('/api/admin/movies/:id', auth, adminOnly, (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id=?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Movie not found' });
  if (movie.video_path) fs.rmSync(path.join(UPLOAD_DIR, movie.video_path), { force: true });
  if (movie.poster_url?.startsWith('/uploads/')) fs.rmSync(path.join(__dirname, movie.poster_url), { force: true });
  db.prepare('DELETE FROM movies WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// HTTP Range streaming for locally uploaded videos
app.get('/stream/:id', (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id=?').get(req.params.id);
  if (!movie || !movie.video_path) return res.status(404).send('Uploaded video not found');
  const filePath = path.join(UPLOAD_DIR, movie.video_path);
  if (!fs.existsSync(filePath)) return res.status(404).send('Video file missing');
  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  db.prepare('UPDATE movies SET views=views+1 WHERE id=?').run(req.params.id);
  if (!range) {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4' });
    return fs.createReadStream(filePath).pipe(res);
  }
  const [startText, endText] = range.replace(/bytes=/, '').split('-');
  const start = parseInt(startText, 10);
  const end = endText ? parseInt(endText, 10) : stat.size - 1;
  const chunkSize = end - start + 1;
  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': 'video/mp4'
  });
  fs.createReadStream(filePath, { start, end }).pipe(res);
});

app.use('/uploads', express.static(UPLOAD_DIR));
app.use((err, req, res, next) => res.status(400).json({ error: err.message || 'Upload failed' }));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`CineNova+ running at http://localhost:${PORT}`));
