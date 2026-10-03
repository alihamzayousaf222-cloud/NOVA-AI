# NOVA AI v3

A local full-stack AI workspace for school projects. The interface is English by default and connects to local Ollama.

## Requirements
- Windows 10/11
- Node.js 18+ (Node 20 LTS recommended)
- Ollama
- `llama3.2` model

## First-time setup

### 1. Server
Open CMD/PowerShell:

```cmd
cd "C:\Users\C C\Desktop\NOVA-AI-FINAL\server"
npm install
npm run dev
```

Expected:

`NOVA AI server: http://localhost:3001`

### 2. Ollama
If Ollama is already running, do NOT run `ollama serve` again.

Check the model:

```cmd
ollama list
```

If needed:

```cmd
ollama pull llama3.2
```

### 3. Client
Open a second terminal:

```cmd
cd "C:\Users\C C\Desktop\NOVA-AI-FINAL\client"
npm install
npm run dev
```

Open the `Local:` URL shown by Vite.

## Default admin

Email: `admin@nova.local`
Password: `Admin@12345`

Change this for any real/public deployment.

## Features
- Student registration with Student ID + email
- Public registration
- Login and logout with persistent JWT session
- English-first NOVA AI assistant
- Ollama / llama3.2 integration
- Server-side chat history
- New chat and delete chat
- File upload and Library
- File context for text/code documents
- Settings page
- Light/Dark theme persistence
- Admin dashboard with statistics, user management and Ollama status
- Responsive layout

## Important
Keep the server terminal running while using the client. Keep Ollama running in the background. Do not run `ollama serve` if it is already running.
