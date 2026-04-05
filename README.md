# Karka English

Kannada-English learning webapp powered by Llama 3.3 70B (via Groq) with Firebase auth and Firestore caching.

## Features
- Word meaning lookup (English → Kannada) with AI
- Vocabulary database (170+ words across 14 categories)
- Grammar checker
- Kannada → English translation
- Quiz mode
- User profiles with progress tracking
- Smart caching — AI responses are cached in Firestore, reducing API usage over time

## Tech Stack
- React 19 + TypeScript + Tailwind CSS v4
- Express server (API proxy for Groq)
- Llama 3.3 70B via Groq API
- Firebase Auth (Google Sign-In) + Cloud Firestore
- Docker for deployment

## Run Locally

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and add your Groq API key
3. Run dev mode: `npm run dev`

## Production (Docker)

```bash
docker compose up --build -d
```

App runs at http://localhost:4173

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | Your Groq API key ([get one free](https://console.groq.com/keys)) |
