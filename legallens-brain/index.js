// Tools for the brain to think
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios'); // NEW: For calling Ollama

// Tools for reading files
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// This turns our brain on!
const app = express();
const port = 3001;

// Tell the brain it's okay to talk to the face
app.use(cors());
app.use(express.json());

// OLLAMA SETUP (Local AI - FREE!)
const OLLAMA_BASE_URL = 'http://localhost:11434'; // Ollama runs on this port

// SIMPLE IN-MEMORY STORAGE
const memoryStorage = {};

// This is for receiving files
const upload = multer({ dest: 'uploads/' });

// Function to read text from a file
async function extractTextFromFile(filePath, originalName) {
  const extension = path.extname(originalName).toLowerCase();
  try {
    if (extension === '.pdf') {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text;
    } else if (extension === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } else {
      throw new Error('Unsupported file type. Please upload a PDF or DOCX file.');
    }
  } catch (error) {
    console.error("Error extracting text:", error);
    throw new Error(`Could not read the file: ${error.message}`);
  }
}

// Function to split text into chunks
function splitTextIntoChunks(text, chunkSize = 500) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks;
}

// NEW FUNCTION: Get embedding using Ollama
async function getEmbedding(text) {
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/embeddings`, {
      model: 'nomic-embed-text', // Good free embedding model
      prompt: text,
    });
    return response.data.embedding;
  } catch (error) {
    console.error('Ollama embedding error:', error.response?.data || error.message);
    throw new Error('Failed to get embedding from local AI');
  }
}

// NEW FUNCTION: Ask question using Ollama
// NEW FUNCTION: Ask question using Ollama (LEGAL EXPERT VERSION)
async function askOllama(question, context) {
  try {
    const prompt = `
      You are a legal contract analysis expert. Based on the following contract text, answer the user's legal question.
      Focus on identifying clauses, obligations, risks, and legal implications.
      If the answer cannot be found in the contract, say "I cannot find the answer in the document."

      CONTRACT TEXT:
      ${context}

      LEGAL QUESTION: ${question}
    `;

    const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
      model: 'mistral', // or llama3.2
      prompt: prompt,
      stream: false
    });

    return response.data.response;
  } catch (error) {
    console.error('Ollama chat error:', error.response?.data || error.message);
    throw new Error('Failed to get answer from local AI');
  }
}

// SIMPLE FUNCTION: Find most similar chunks
function findSimilarChunks(questionEmbedding, storedChunks, topK = 3) {
  if (!storedChunks || storedChunks.length === 0) return [];
  
  const similarities = storedChunks.map(chunk => {
    if (!chunk.embedding) return -1;
    const dotProduct = chunk.embedding.reduce((sum, val, i) => sum + val * questionEmbedding[i], 0);
    const magnitudeA = Math.sqrt(chunk.embedding.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(questionEmbedding.reduce((sum, val) => sum + val * val, 0));
    return magnitudeA * magnitudeB > 0 ? dotProduct / (magnitudeA * magnitudeB) : -1;
  });
  
  return storedChunks
    .map((chunk, index) => ({ chunk, similarity: similarities[index] }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .map(item => item.chunk.text);
}

// The brain's homepage
app.get('/', (req, res) => {
  res.send('Hello! I am LegalLens Brain! I am working!');
});

// UPLOAD ENDPOINT
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }
    console.log("File received:", req.file.originalname);

    // 1. EXTRACT TEXT from the uploaded file
    const extractedText = await extractTextFromFile(req.file.path, req.file.originalname);
    console.log("Text length:", extractedText.length);

    // 2. CHUNK the text into smaller pieces
    const textChunks = splitTextIntoChunks(extractedText);
    console.log(`Split into ${textChunks.length} chunks!`);

    // 3. STORE chunks in memory
    memoryStorage[req.file.filename] = {
      chunks: [],
      originalName: req.file.originalname
    };

    // 4. For each chunk, get its embedding and store it
    console.log("Starting to create embeddings... (This might take a moment)");
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      const embedding = await getEmbedding(chunk);
      
      memoryStorage[req.file.filename].chunks.push({
        text: chunk,
        embedding: embedding
      });
      console.log(`Added chunk ${i+1}/${textChunks.length} to memory`);
    }
    console.log("All chunks stored in AI memory!");

    res.json({ 
      message: 'File uploaded, processed, and memorized by AI!', 
      filename: req.file.originalname,
      chunkCount: textChunks.length,
      sessionId: req.file.filename
    });

  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).send(error.message);
  }
});

// ASK ENDPOINT: Uses Ollama
app.post('/ask', async (req, res) => {
  try {
    const { question, sessionId } = req.body;

    if (!question || !sessionId) {
      return res.status(400).send('Missing question or session ID.');
    }

    console.log(`Question for session ${sessionId}:`, question);

    // 1. Get embedding for the question
    const questionEmbedding = await getEmbedding(question);

    // 2. Get stored chunks
    const storedData = memoryStorage[sessionId];
    if (!storedData || !storedData.chunks) {
      return res.status(404).send('Document not found. Please upload a file first.');
    }

    // 3. Find relevant chunks
    const relevantChunks = findSimilarChunks(questionEmbedding, storedData.chunks, 3);
    if (relevantChunks.length === 0) {
      return res.json({
        answer: "I cannot find relevant information in the document to answer this question.",
        sources: []
      });
    }

    // 4. Ask Ollama
    const answer = await askOllama(question, relevantChunks.join('\n\n'));

    res.json({
      answer: answer,
      sources: relevantChunks
    });

  } catch (error) {
    console.error("Ask error:", error);
    res.status(500).send(error.message);
  }
});
// Temporary route to see stored sessions
app.get('/sessions', (req, res) => {
  res.json(Object.keys(memoryStorage));
});
// Start the server
// NEW ENDPOINT: Analyze document for legal clauses
app.post('/analyze', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).send('Missing session ID.');
    }

    console.log(`Analyzing document for legal clauses: ${sessionId}`);

    // Get the stored chunks
    const storedData = memoryStorage[sessionId];
    if (!storedData || !storedData.chunks) {
      return res.status(404).send('Document not found. Please upload a file first.');
    }

    // Combine first few chunks for analysis
    const sampleText = storedData.chunks.slice(0, 3).map(chunk => chunk.text).join('\n\n');

    const analysisPrompt = `
      Analyze the following contract text and identify key legal clauses. 
      Return a JSON array with objects containing: clauseName, clauseType, riskLevel (low/medium/high), and description.

      CONTRACT TEXT:
      ${sampleText}

      Return ONLY valid JSON, no other text.
    `;

    const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
      model: 'mistral',
      prompt: analysisPrompt,
      stream: false
    });

    // Try to parse the JSON response
    try {
      const clauses = JSON.parse(response.data.response);
      res.json({ clauses });
    } catch (parseError) {
      res.json({ 
        clauses: [],
        error: "Could not parse legal analysis" 
      });
    }

  } catch (error) {
    console.error("Analysis error:", error);
    res.status(500).send(error.message);
  }
});
app.listen(port, () => {
  console.log(`LegalLens brain is listening on door ${port}`);
});
