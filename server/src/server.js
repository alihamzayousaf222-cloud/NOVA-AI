import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDb, readDb, writeDb } from './db.js';
import { requireAuth, requireAdmin, signToken } from './auth.js';
import { askOllama, ollamaStatus } from './ollama.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const UPLOAD_DIR = path.resolve('uploads');
await fs.mkdir(UPLOAD_DIR, { recursive: true });
await ensureDb();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const safeUser = u => ({ id:u.id, name:u.name, email:u.email, accountType:u.accountType, studentId:u.studentId || '', role:u.role, createdAt:u.createdAt });
const findUser = (db, id) => db.users.find(u => u.id === id);
const cleanChat = c => ({ id:c.id, title:c.title, createdAt:c.createdAt, updatedAt:c.updatedAt });

app.get('/api/health', async (_req,res) => {
  const status = await ollamaStatus();
  res.json({ ok:true, server:true, ollama:status, time:new Date().toISOString() });
});

app.post('/api/auth/register', async (req,res) => {
  const { name, email, password, accountType='public', studentId='' } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error:'Name, email and password are required.' });
  if (!['student','public'].includes(accountType)) return res.status(400).json({ error:'Invalid account type.' });
  if (accountType === 'student' && !studentId?.trim()) return res.status(400).json({ error:'Student ID is required for student registration.' });
  if (password.length < 6) return res.status(400).json({ error:'Password must be at least 6 characters.' });
  const db = await readDb();
  const emailLower = email.trim().toLowerCase();
  if (db.users.some(u => u.email === emailLower)) return res.status(409).json({ error:'An account with this email already exists.' });
  if (accountType === 'student' && db.users.some(u => u.studentId && u.studentId.toLowerCase() === studentId.trim().toLowerCase())) return res.status(409).json({ error:'That Student ID is already registered.' });
  const user = { id:randomUUID(), name:name.trim(), email:emailLower, passwordHash:await bcrypt.hash(password,12), accountType, studentId:studentId.trim(), role:'user', createdAt:new Date().toISOString() };
  db.users.push(user); await writeDb(db);
  res.status(201).json({ user:safeUser(user), token:signToken(user) });
});

app.post('/api/auth/login', async (req,res) => {
  const { email, password } = req.body || {};
  const db = await readDb();
  const user = db.users.find(u => u.email === String(email || '').trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) return res.status(401).json({ error:'Invalid email or password.' });
  res.json({ user:safeUser(user), token:signToken(user) });
});

app.get('/api/auth/me', requireAuth, async (req,res) => {
  const db = await readDb(); const user = findUser(db, req.auth.sub);
  if (!user) return res.status(401).json({ error:'Account no longer exists.' });
  res.json({ user:safeUser(user) });
});

app.get('/api/chats', requireAuth, async (req,res) => {
  const db = await readDb();
  res.json({ chats:db.chats.filter(c=>c.userId===req.auth.sub).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).map(cleanChat) });
});

app.post('/api/chats', requireAuth, async (req,res) => {
  const db = await readDb(); const now = new Date().toISOString();
  const chat = { id:randomUUID(), userId:req.auth.sub, title:(req.body?.title || 'New Chat').slice(0,80), createdAt:now, updatedAt:now };
  db.chats.push(chat); await writeDb(db); res.status(201).json({ chat:cleanChat(chat) });
});

app.patch('/api/chats/:id', requireAuth, async (req,res) => {
  const db = await readDb(); const chat=db.chats.find(c=>c.id===req.params.id && c.userId===req.auth.sub);
  if (!chat) return res.status(404).json({error:'Chat not found.'});
  if (req.body?.title) chat.title=String(req.body.title).slice(0,80); chat.updatedAt=new Date().toISOString(); await writeDb(db); res.json({chat:cleanChat(chat)});
});

app.get('/api/chats/:id/messages', requireAuth, async (req,res) => {
  const db = await readDb(); const chat=db.chats.find(c=>c.id===req.params.id && c.userId===req.auth.sub);
  if (!chat) return res.status(404).json({error:'Chat not found.'});
  res.json({ messages:db.messages.filter(m=>m.chatId===chat.id).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)) });
});

app.delete('/api/chats/:id', requireAuth, async (req,res) => {
  const db=await readDb(); const chat=db.chats.find(c=>c.id===req.params.id && c.userId===req.auth.sub);
  if (!chat) return res.status(404).json({error:'Chat not found.'});
  db.chats=db.chats.filter(c=>c.id!==chat.id); db.messages=db.messages.filter(m=>m.chatId!==chat.id); await writeDb(db); res.json({ok:true});
});

app.post('/api/upload', requireAuth, upload.single('file'), async (req,res) => {
  if (!req.file) return res.status(400).json({error:'No file uploaded.'});
  const allowedText = /\.(txt|md|csv|json|js|jsx|ts|tsx|html|css|py|java|c|cpp|php|sql|xml|yaml|yml)$/i.test(req.file.originalname);
  let extracted='';
  if (allowedText) {
    try { extracted=(await fs.readFile(req.file.path,'utf8')).slice(0,120000); } catch {}
  }
  const db=await readDb();
  const record={ id:randomUUID(), userId:req.auth.sub, originalName:req.file.originalname, storedName:req.file.filename, mimeType:req.file.mimetype, size:req.file.size, extracted, createdAt:new Date().toISOString() };
  db.files.push(record); await writeDb(db);
  res.status(201).json({ file:{id:record.id, name:record.originalName, mimeType:record.mimeType, size:record.size, createdAt:record.createdAt, hasText:!!extracted} });
});

app.get('/api/library', requireAuth, async (req,res) => {
  const db=await readDb(); res.json({ files:db.files.filter(f=>f.userId===req.auth.sub).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(f=>({id:f.id,name:f.originalName,mimeType:f.mimeType,size:f.size,createdAt:f.createdAt,hasText:!!f.extracted})) });
});

app.delete('/api/library/:id', requireAuth, async (req,res) => {
  const db=await readDb(); const f=db.files.find(x=>x.id===req.params.id && x.userId===req.auth.sub); if(!f) return res.status(404).json({error:'File not found.'});
  try { await fs.unlink(path.join(UPLOAD_DIR,f.storedName)); } catch {}
  db.files=db.files.filter(x=>x.id!==f.id); await writeDb(db); res.json({ok:true});
});

app.post('/api/chat', requireAuth, async (req,res) => {
  const { chatId, message, fileId }=req.body || {};
  if (!message?.trim()) return res.status(400).json({error:'Message is required.'});
  const db=await readDb();
  let chat=db.chats.find(c=>c.id===chatId && c.userId===req.auth.sub);
  if(!chat){ const now=new Date().toISOString(); chat={id:randomUUID(),userId:req.auth.sub,title:message.trim().slice(0,60),createdAt:now,updatedAt:now}; db.chats.push(chat); }
  const prior=db.messages.filter(m=>m.chatId===chat.id).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).slice(-20);
  const userMsg={id:randomUUID(),chatId:chat.id,role:'user',content:message.trim(),createdAt:new Date().toISOString()}; db.messages.push(userMsg);
  let fileContext=''; if(fileId){ const f=db.files.find(x=>x.id===fileId && x.userId===req.auth.sub); if(f?.extracted) fileContext=`Filename: ${f.originalName}\n${f.extracted}`; }
  try {
    const answer=await askOllama([...prior,userMsg],fileContext);
    const aiMsg={id:randomUUID(),chatId:chat.id,role:'assistant',content:answer,createdAt:new Date().toISOString()}; db.messages.push(aiMsg); chat.updatedAt=aiMsg.createdAt; await writeDb(db); res.json({chat:cleanChat(chat),message:aiMsg});
  } catch(e) {
    db.messages=db.messages.filter(m=>m.id!==userMsg.id); await writeDb(db);
    res.status(503).json({error:`NOVA AI could not reach Ollama. Make sure Ollama is running and llama3.2 is installed. Details: ${e.message}`});
  }
});

app.get('/api/admin/stats', requireAuth, requireAdmin, async (_req,res)=>{ const db=await readDb(); res.json({stats:{users:db.users.filter(u=>u.role!=='admin').length,students:db.users.filter(u=>u.accountType==='student').length,publicUsers:db.users.filter(u=>u.accountType==='public').length,chats:db.chats.length,files:db.files.length},ollama:await ollamaStatus()}); });
app.get('/api/admin/users', requireAuth, requireAdmin, async (_req,res)=>{ const db=await readDb(); res.json({users:db.users.map(safeUser).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))}); });
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req,res)=>{ const db=await readDb(); const user=db.users.find(u=>u.id===req.params.id); if(!user) return res.status(404).json({error:'User not found.'}); if(user.role==='admin') return res.status(400).json({error:'The admin account cannot be deleted.'}); db.users=db.users.filter(u=>u.id!==user.id); const chatIds=db.chats.filter(c=>c.userId===user.id).map(c=>c.id); db.chats=db.chats.filter(c=>c.userId!==user.id); db.messages=db.messages.filter(m=>!chatIds.includes(m.chatId)); db.files=db.files.filter(f=>f.userId!==user.id); await writeDb(db); res.json({ok:true}); });

app.use((_req,res)=>res.status(404).json({error:'API route not found.'}));
app.use((err,_req,res,_next)=>{ console.error(err); res.status(500).json({error:err.message || 'Server error.'}); });

app.listen(PORT,()=>console.log(`NOVA AI server: http://localhost:${PORT}`));
