// Tools for the brain to think
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');

// Tools for reading files
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// ChromaDB for persistent vector storage
const { ChromaClient } = require('chromadb');

// LangChain for optimal text chunking
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');

// This turns our brain on!
const app = express();
const port = 3001;

// Tell the brain it's okay to talk to the face
app.use(cors());
app.use(express.json());

// OLLAMA SETUP (Local AI - FREE!)
const OLLAMA_BASE_URL = 'http://localhost:11434';

// OPTIMAL LLM PARAMETERS for legal document analysis
// Based on research and testing with Llama models
const OPTIMAL_LLM_PARAMS = {
  temperature: 0.2,        // Low for factual, consistent answers
  top_p: 0.85,            // Slightly restrictive for focused responses
  top_k: 30,              // Limit vocabulary for precision
  repeat_penalty: 1.15,   // Reduce repetition
  num_predict: 600,       // Enough for detailed legal explanations
};

// OPTIMAL RETRIEVAL SETTINGS
const OPTIMAL_RETRIEVAL = {
  initialFetch: 20,       // Fetch more candidates for better recall
  afterReranking: 5,      // Use top 5 for context (balance between context and noise)
};

// ChromaDB Setup - connects to ChromaDB server
const chromaClient = new ChromaClient({
  path: 'http://localhost:8000'
});
let collection;

// Initialize ChromaDB collection
async function initChromaDB() {
  try {
    collection = await chromaClient.getOrCreateCollection({
      name: "legal_documents",
      metadata: { "hnsw:space": "cosine" }
    });
    console.log("✅ ChromaDB collection ready!");
  } catch (error) {
    console.error("❌ ChromaDB initialization error:", error.message);
    console.log("💡 Make sure ChromaDB server is running: chroma run --path ./chroma_data --port 8000");
    throw error;
  }
}

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

// OPTIMAL CHUNKING STRATEGY: Semantic chunking with sentence transformers
// Based on research: optimal chunk size for legal documents is 512-1024 tokens (~700-1400 chars)
// ============================================
// 🧩 CHUNKING: LangChain RecursiveCharacterTextSplitter
// ============================================
// Industry-standard semantic chunking with recursive splitting
// Splits on: paragraphs → sentences → words → characters
async function optimalChunkText(text) {
  const OPTIMAL_CHUNK_SIZE = 1200; // chars (roughly 300 tokens)
  const OVERLAP = 200; // 15-20% overlap is optimal
  
  // Initialize LangChain's RecursiveCharacterTextSplitter
  // This is the industry-standard chunking model used in production RAG systems
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: OPTIMAL_CHUNK_SIZE,
    chunkOverlap: OVERLAP,
    separators: [
      "\n\n",  // Split by paragraphs first (legal documents have clear structure)
      "\n",    // Then by lines
      ". ",    // Then by sentences
      " ",     // Then by words
      ""       // Finally by characters if needed
    ],
    keepSeparator: true,
    lengthFunction: (text) => text.length,
  });
  
  // Split the text using LangChain's recursive algorithm
  const documents = await textSplitter.createDocuments([text]);
  
  // Convert LangChain documents to our chunk format with metadata
  const chunks = documents.map((doc, index) => ({
    text: doc.pageContent.trim(),
    metadata: {
      length: doc.pageContent.trim().length,
      position: index,
      sentenceCount: (doc.pageContent.match(/[.!?]+/g) || []).length,
      wordCount: doc.pageContent.trim().split(/\s+/).length
    }
  }));
  
  console.log(`📊 LangChain chunking: ${chunks.length} chunks, avg: ${Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length)} chars`);
  
  return chunks;
}

// Helper functions removed - no longer needed with LangChain
// (createChunk and getOverlap were part of custom implementation)

// Get embedding using Ollama
async function getEmbedding(text) {
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/embeddings`, {
      model: 'nomic-embed-text',
      prompt: text,
    });
    return response.data.embedding;
  } catch (error) {
    console.error('Ollama embedding error:', error.response?.data || error.message);
    throw new Error('Failed to get embedding from local AI');
  }
}

// OPTIMAL RERANKING: Hybrid approach combining multiple signals
// Based on research: combining semantic + lexical + position gives best results
function optimalReranking(query, chunks, topK = 5) {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const queryBigrams = [];
  const queryTrigrams = [];
  
  // Create n-grams for phrase matching
  for (let i = 0; i < queryWords.length - 1; i++) {
    queryBigrams.push(queryWords[i] + ' ' + queryWords[i + 1]);
    if (i < queryWords.length - 2) {
      queryTrigrams.push(queryWords[i] + ' ' + queryWords[i + 1] + ' ' + queryWords[i + 2]);
    }
  }
  
  const scoredChunks = chunks.map(chunk => {
    const chunkText = chunk.text.toLowerCase();
    const chunkWords = chunkText.split(/\s+/);
    
    // 1. BM25-inspired keyword scoring (better than simple TF)
    let bm25Score = 0;
    const k1 = 1.5; // term frequency saturation
    const b = 0.75; // length normalization
    const avgDocLength = 300; // average words per chunk
    const docLength = chunkWords.length;
    
    for (const word of queryWords) {
      const tf = (chunkText.match(new RegExp(word, 'g')) || []).length;
      const normalizedTF = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));
      bm25Score += normalizedTF * 2; // IDF approximation
    }
    
    // 2. Exact phrase matching (trigrams > bigrams > unigrams)
    let phraseScore = 0;
    for (const trigram of queryTrigrams) {
      if (chunkText.includes(trigram)) phraseScore += 10; // Highest weight
    }
    for (const bigram of queryBigrams) {
      if (chunkText.includes(bigram)) phraseScore += 5;
    }
    
    // 3. Semantic similarity (from vector search)
    const semanticScore = chunk.distance ? (1 - chunk.distance) * 10 : 0;
    
    // 4. Position bias (earlier chunks slightly preferred for legal docs)
    const positionScore = chunk.metadata?.position ? Math.max(0, 3 - chunk.metadata.position * 0.1) : 0;
    
    // 5. Length quality score (prefer chunks with moderate length)
    const optimalLength = 1200;
    const lengthDiff = Math.abs((chunk.metadata?.length || 1000) - optimalLength);
    const lengthScore = Math.max(0, 2 - (lengthDiff / 500));
    
    // Optimal weights based on RAG research
    const combinedScore = 
      semanticScore * 0.45 +      // 45% semantic (most important)
      bm25Score * 0.30 +           // 30% lexical matching
      phraseScore * 0.15 +         // 15% exact phrases
      positionScore * 0.05 +       // 5% position
      lengthScore * 0.05;          // 5% length quality
    
    return {
      ...chunk,
      scores: {
        semantic: semanticScore.toFixed(2),
        bm25: bm25Score.toFixed(2),
        phrase: phraseScore,
        position: positionScore.toFixed(2),
        length: lengthScore.toFixed(2),
        combined: combinedScore.toFixed(2)
      },
      combinedScore: combinedScore
    };
  });
  
  const sorted = scoredChunks.sort((a, b) => b.combinedScore - a.combinedScore);
  const topChunks = sorted.slice(0, topK);
  
  console.log(`🎯 Optimal reranking: Top=${topChunks[0]?.combinedScore.toFixed(2)}, Avg=${(topChunks.reduce((s, c) => s + c.combinedScore, 0) / topChunks.length).toFixed(2)}`);
  
  return topChunks;
}

// Ask question using Ollama with optimal parameters
async function askOllama(question, context, llmParams = OPTIMAL_LLM_PARAMS) {
  try {
    const prompt = `You are a legal contract analysis expert. Answer the user's question based on the contract excerpts provided below.

Focus on:
- Identifying relevant clauses and provisions
- Explaining obligations and rights
- Highlighting risks and liabilities
- Providing clear legal interpretations

If the information is not in the provided contract text, say "I cannot find this information in the contract."

CONTRACT EXCERPTS:
${context}

QUESTION: ${question}

ANSWER:`;

    const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
      model: 'llama3.2',
      prompt: prompt,
      stream: false,
      options: {
        temperature: llmParams.temperature,
        top_p: llmParams.top_p,
        top_k: llmParams.top_k,
        repeat_penalty: llmParams.repeat_penalty,
        num_predict: llmParams.num_predict,
      }
    });
    return response.data.response;
  } catch (error) {
    console.error('Ollama chat error:', error.response?.data || error.message);
    throw new Error('Failed to get answer from local AI');
  }
}

// The brain's homepage
app.get('/', (req, res) => {
  res.send('Hello! I am LegalLens Brain with ChromaDB! I am working!');
});

// UPLOAD ENDPOINT with ChromaDB and optimal chunking
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No file uploaded.');
    }
    
    console.log("📄 File received:", req.file.originalname);
    console.log(`⚙️  Using optimal chunking strategy (1200 chars, 200 overlap)`);
    
    // 1. EXTRACT TEXT from the uploaded file
    const extractedText = await extractTextFromFile(req.file.path, req.file.originalname);
    console.log("📝 Text length:", extractedText.length);
    
    // 2. OPTIMAL CHUNKING
    const chunks = optimalChunkText(extractedText);
    console.log(`✂️  Created ${chunks.length} optimally-sized chunks!`);
    
    // 3. Generate embeddings and store in ChromaDB
    console.log("🧠 Creating embeddings and storing in ChromaDB...");
    
    const sessionId = req.file.filename;
    const ids = [];
    const embeddings = [];
    const documents = [];
    const metadatas = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk.text);
      
      ids.push(`${sessionId}_chunk_${i}`);
      embeddings.push(embedding);
      documents.push(chunk.text);
      metadatas.push({
        sessionId: sessionId,
        filename: req.file.originalname,
        chunkIndex: i,
        ...chunk.metadata
      });
      
      console.log(`✅ Processed chunk ${i+1}/${chunks.length}`);
    }
    
    // Add all chunks to ChromaDB at once
    await collection.add({
      ids: ids,
      embeddings: embeddings,
      documents: documents,
      metadatas: metadatas
    });
    
    console.log("💾 All chunks stored in ChromaDB!");
    
    // Clean up uploaded file
    await fs.unlink(req.file.path);
    
    res.json({ 
      message: 'File uploaded, processed, and stored with optimal RAG strategy!', 
      filename: req.file.originalname,
      chunkCount: chunks.length,
      sessionId: sessionId,
      strategy: 'optimal'
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).send(error.message);
  }
});

// ASK ENDPOINT with improved retrieval and reranking
app.post('/ask', async (req, res) => {
  try {
    const { question, sessionId, settings } = req.body;
    
    if (!question) {
      return res.status(400).send('Missing question.');
    }
    
    // Use optimal settings (ignore user settings for now - they're just for display)
    const retrievalCount = OPTIMAL_RETRIEVAL.initialFetch;
    const rerankCount = OPTIMAL_RETRIEVAL.afterReranking;
    const llmParams = OPTIMAL_LLM_PARAMS;
    
    console.log(`❓ Question: ${question}`);
    console.log(`⚙️  Using optimal settings: retrieve=${retrievalCount}, rerank=${rerankCount}`);
    
    // 1. Get embedding for the question
    const questionEmbedding = await getEmbedding(question);
    
    // 2. Query ChromaDB for similar chunks
    const queryParams = {
      queryEmbeddings: [questionEmbedding],
      nResults: retrievalCount
    };
    
    // If sessionId provided, search only that document, otherwise search all
    if (sessionId) {
      queryParams.where = { sessionId: sessionId };
      console.log(`🔍 Searching in document: ${sessionId}`);
    } else {
      console.log(`🔍 Searching across ALL documents`);
    }
    
    const results = await collection.query(queryParams);
    
    if (!results.documents[0] || results.documents[0].length === 0) {
      return res.json({
        answer: "I cannot find relevant information in the document(s) to answer this question.",
        sources: [],
        searchedDocuments: sessionId ? 1 : 'all'
      });
    }
    
    // 3. Prepare chunks for reranking
    const retrievedChunks = results.documents[0].map((doc, idx) => ({
      text: doc,
      distance: results.distances[0][idx],
      metadata: results.metadatas[0][idx]
    }));
    
    console.log(`🔍 Retrieved ${retrievedChunks.length} chunks from ChromaDB`);
    
    // 4. OPTIMAL RERANKING
    const rerankedChunks = optimalReranking(question, retrievedChunks, rerankCount);
    console.log(`🎯 Reranked to top ${rerankedChunks.length} chunks`);
    
    // 5. Group by document for multi-doc search
    const documentSources = new Map();
    rerankedChunks.forEach(chunk => {
      const filename = chunk.metadata?.filename || 'Unknown';
      if (!documentSources.has(filename)) {
        documentSources.set(filename, []);
      }
      documentSources.get(filename).push(chunk.text);
    });
    
    // 6. Ask Ollama with reranked context and custom LLM params
    const context = rerankedChunks.map(c => {
      const filename = c.metadata?.filename || 'Unknown';
      return `[Source: ${filename}]\n${c.text}`;
    }).join('\n\n---\n\n');
    
    const answer = await askOllama(question, context, llmParams);
    
    res.json({
      answer: answer,
      sources: rerankedChunks.map(c => ({
        text: c.text,
        filename: c.metadata?.filename || 'Unknown',
        scores: c.scores
      })),
      retrievalInfo: {
        initialRetrieved: retrievedChunks.length,
        afterReranking: rerankedChunks.length,
        documentsSearched: documentSources.size,
        settings: {
          retrievalCount: OPTIMAL_RETRIEVAL.initialFetch,
          rerankCount: OPTIMAL_RETRIEVAL.afterReranking,
          temperature: OPTIMAL_LLM_PARAMS.temperature,
          topP: OPTIMAL_LLM_PARAMS.top_p,
          topK: OPTIMAL_LLM_PARAMS.top_k,
          strategy: 'optimal' // Indicate we're using research-based optimal settings
        }
      }
    });
  } catch (error) {
    console.error("Ask error:", error);
    res.status(500).send(error.message);
  }
});

// Get all sessions
app.get('/sessions', async (req, res) => {
  try {
    const allData = await collection.get();
    const sessionsMap = new Map();
    
    if (allData.metadatas) {
      allData.metadatas.forEach(meta => {
        if (meta.sessionId) {
          if (!sessionsMap.has(meta.sessionId)) {
            sessionsMap.set(meta.sessionId, {
              sessionId: meta.sessionId,
              filename: meta.filename,
              chunkCount: 0
            });
          }
          sessionsMap.get(meta.sessionId).chunkCount++;
        }
      });
    }
    
    res.json(Array.from(sessionsMap.values()));
  } catch (error) {
    console.error("Sessions error:", error);
    res.status(500).send(error.message);
  }
});

// Analyze document for legal clauses
app.post('/analyze', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).send('Missing session ID.');
    }
    
    console.log(`⚖️  Analyzing document for legal clauses: ${sessionId}`);
    
    // Get first few chunks from ChromaDB
    const results = await collection.get({
      where: { sessionId: sessionId },
      limit: 5
    });
    
    if (!results.documents || results.documents.length === 0) {
      return res.status(404).send('Document not found.');
    }
    
    const sampleText = results.documents.join('\n\n');
    
    const analysisPrompt = `Analyze the following contract text and identify key legal clauses. Return a JSON array with objects containing: clauseName, clauseType, riskLevel (low/medium/high), and description.

CONTRACT TEXT:
${sampleText}

Return ONLY valid JSON, no other text.`;

    const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
      model: 'llama3.2',
      prompt: analysisPrompt,
      stream: false
    });
    
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

// Delete a session
app.delete('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get all IDs for this session
    const results = await collection.get({
      where: { sessionId: sessionId }
    });
    
    if (results.ids && results.ids.length > 0) {
      await collection.delete({
        ids: results.ids
      });
      res.json({ message: `Deleted ${results.ids.length} chunks for session ${sessionId}` });
    } else {
      res.status(404).send('Session not found');
    }
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).send(error.message);
  }
});

// Start the server
async function startServer() {
  await initChromaDB();
  app.listen(port, () => {
    console.log(`🧠 LegalLens Brain with ChromaDB is listening on port ${port}`);
  });
}

startServer();
