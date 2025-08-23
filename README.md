# ⚖️ LegalLens AI - AI-Powered Legal Contract Analyzer

A full-stack application that uses local AI to analyze legal documents, extract clauses, and answer questions about contracts.

## 🏗️ Project Structure
legal-lens-robot/
├── legallens-brain/ # Node.js Backend (Express + Ollama)
├── legallens-face/ # React Frontend (TypeScript + Tailwind)
├── .gitignore
└── README.md

text

## 🚀 Quick Start
1. Backend: `cd legallens-brain && npm install && node index.js`
2. Frontend: `cd legallens-face && npm install && npm start`  
3. AI: `ollama serve` (in separate terminal)

## 📍 Live Demo
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## 🛠️ Tech Stack
- **Backend**: Node.js, Express, Ollama, pdf-parse, mammoth
- **Frontend**: React, TypeScript, Tailwind CSS
- **AI**: Local Mistral/Llama models via Ollama

