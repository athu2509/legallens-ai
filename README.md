# ⚖️ LegalLens AI - AI-Powered Legal Contract Analyzer

A full-stack RAG application that uses local AI to analyze legal documents with industry-standard chunking, retrieval, and reranking strategies.

## 🏗️ Project Structure

legal-lens-robot/ ├── legallens-brain/ # Node.js Backend (Express + Ollama + ChromaDB) ├── legallens-face/ # React Frontend (TypeScript) ├── chroma_data/ # ChromaDB persistent storage (not in git) ├── venv/ # Python virtual environment (not in git) └── README.md


## 🚀 Quick Start

### Prerequisites
- Node.js installed
- Python 3 with pip
- Ollama installed with models: `llama3.2` and `nomic-embed-text`

### 1. Start ChromaDB Server
```bash
python3 -m venv venv
source venv/bin/activate
pip install chromadb
chroma run --path ./chroma_data --port 8000
2. Start Backend
cd legallens-brain
npm install
node index.js
3. Start Frontend
cd legallens-face
npm install
npm start
4. Start Ollama
ollama serve
📍 Services
Frontend: http://localhost:3000
Backend: http://localhost:3001
ChromaDB: http://localhost:8000
Ollama: http://localhost:11434
🛠️ Tech Stack
Backend
Chunking: LangChain RecursiveCharacterTextSplitter
Embedding: nomic-embed-text (768-dim)
Vector DB: ChromaDB with HNSW
Reranking: BM25 + Semantic hybrid
LLM: Llama 3.2
Frontend
React, TypeScript
🧠 RAG Pipeline
Upload → Chunk (LangChain) → Embed (nomic) → Store (ChromaDB)
Query → Embed → Search (20) → Rerank (5) → Generate (Llama 3.2)
📡 API Endpoints
POST /upload - Upload PDF/DOCX
POST /ask - Ask question
GET /sessions - List documents
DELETE /session/:id - Delete document
📝 Models Used
Component	Model
Chunking	LangChain RecursiveCharacterTextSplitter
Embedding	nomic-embed-text (768-dim)
Vector Search	ChromaDB HNSW
Reranking	BM25 + Semantic Hybrid
LLM	Llama 3.2 (3B)
