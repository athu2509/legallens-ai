import React, { useState } from 'react';
import './App.css';

interface Message {
  type: 'user' | 'ai';
  content: string;
  sources?: any[];
  retrievalInfo?: any;
}

interface UploadResponse {
  message: string;
  filename: string;
  chunkCount: number;
  sessionId: string;
}

interface StoredSession {
  sessionId: string;
  filename: string;
  chunkCount: number;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [documentName, setDocumentName] = useState<string>('');
  const [storedSessions, setStoredSessions] = useState<StoredSession[]>([]);
  const [globalSearchResults, setGlobalSearchResults] = useState<Message[]>([]);

  React.useEffect(() => {
    loadStoredSessions();
  }, []);

  const loadStoredSessions = async () => {
    try {
      const response = await fetch('http://localhost:3001/sessions');
      if (response.ok) {
        const sessions = await response.json();
        setStoredSessions(sessions);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('http://localhost:3001/upload', {
        method: 'POST',
        body: formData,
      });

      const result: UploadResponse = await response.json();
      
      if (response.ok) {
        setSessionId(result.sessionId);
        setDocumentName(result.filename);
        setMessages([{
          type: 'ai',
          content: `✅ Successfully processed ${result.filename}! Found ${result.chunkCount} sections using optimal RAG strategy. Ready for your questions.`
        }]);
        loadStoredSessions();
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
    }
  };

  const handleGlobalSearch = async () => {
    if (!inputMessage.trim()) return;

    const question = inputMessage.trim();
    setInputMessage('');
    setIsAnalyzing(true);

    setGlobalSearchResults(prev => [...prev, { type: 'user', content: question }]);

    try {
      const response = await fetch('http://localhost:3001/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      const result = await response.json();
      
      if (response.ok) {
        setGlobalSearchResults(prev => [...prev, { 
          type: 'ai', 
          content: result.answer, 
          sources: result.sources,
          retrievalInfo: result.retrievalInfo
        }]);
      }
    } catch (error) {
      console.error('Global search error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSendQuestion = async () => {
    if (!inputMessage.trim() || !sessionId) return;

    const question = inputMessage.trim();
    setInputMessage('');
    setMessages(prev => [...prev, { type: 'user', content: question }]);
    setIsAnalyzing(true);

    try {
      const response = await fetch('http://localhost:3001/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, sessionId }),
      });

      const result = await response.json();
      
      if (response.ok) {
        setMessages(prev => [...prev, {
          type: 'ai',
          content: result.answer,
          sources: result.sources,
          retrievalInfo: result.retrievalInfo
        }]);
      }
    } catch (error) {
      console.error('Ask error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLoadDocument = (session: StoredSession) => {
    setSessionId(session.sessionId);
    setDocumentName(session.filename);
    setMessages([{
      type: 'ai',
      content: `📄 Loaded: ${session.filename}. Ask me anything about this contract.`
    }]);
  };

  const handleNewDocument = () => {
    setSessionId('');
    setDocumentName('');
    setMessages([]);
    setGlobalSearchResults([]);
    loadStoredSessions();
  };

  return (
    <div className="App">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo">⚖️</div>
            <div className="title-section">
              <h1>LegalLens AI</h1>
              <p>Powered by Advanced RAG Technology</p>
            </div>
          </div>
          <div className="tech-stack">
            <span className="tech-badge">🧠 Optimal Chunking</span>
            <span className="tech-badge">🎯 BM25 Reranking</span>
            <span className="tech-badge">💾 ChromaDB</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-container">
        {!sessionId ? (
          <div className="home-view">
            {/* Upload Section */}
            <div className="upload-section">
              <div className="upload-card">
                <div className="upload-icon-large">📄</div>
                <h2>Upload Legal Contract</h2>
                <p>Drag & drop or click to browse • PDF & DOCX supported</p>
                
                <input
                  type="file"
                  id="file-upload"
                  onChange={handleFileChange}
                  accept=".pdf,.docx"
                  className="file-input-hidden"
                />
                
                <label htmlFor="file-upload" className="upload-dropzone">
                  {selectedFile ? (
                    <div className="file-selected">
                      <div className="file-icon">✓</div>
                      <div className="file-details">
                        <div className="file-name">{selectedFile.name}</div>
                        <div className="file-size">{(selectedFile.size / 1024).toFixed(1)} KB</div>
                      </div>
                    </div>
                  ) : (
                    <div className="upload-prompt">
                      <div className="upload-icon">📤</div>
                      <div className="upload-text">Click or drop your contract here</div>
                    </div>
                  )}
                </label>

                {selectedFile && (
                  <button className="upload-button" onClick={handleUpload} disabled={isUploading}>
                    {isUploading ? (
                      <>
                        <span className="spinner"></span>
                        Processing with Optimal RAG...
                      </>
                    ) : (
                      <>🚀 Analyze Contract</>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Multi-Document Search */}
            {storedSessions.length > 0 && (
              <div className="search-section">
                <div className="section-header">
                  <h2>🔍 Search All Contracts</h2>
                  <span className="badge">{storedSessions.length} indexed</span>
                </div>
                
                <div className="search-box">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Ask anything across all your contracts..."
                    onKeyPress={(e) => e.key === 'Enter' && handleGlobalSearch()}
                    className="search-input"
                  />
                  <button
                    onClick={handleGlobalSearch}
                    disabled={!inputMessage.trim() || isAnalyzing}
                    className="search-button"
                  >
                    {isAnalyzing ? '⏳' : 'Search'}
                  </button>
                </div>

                {globalSearchResults.length > 0 && (
                  <div className="results-container">
                    {globalSearchResults.map((msg, idx) => (
                      <div key={idx} className={`message-card ${msg.type}`}>
                        <div className="message-text">{msg.content}</div>
                        
                        {msg.retrievalInfo && (
                          <div className="info-pills">
                            <span className="pill">📊 {msg.retrievalInfo.initialRetrieved} retrieved</span>
                            <span className="pill">🎯 {msg.retrievalInfo.afterReranking} reranked</span>
                            <span className="pill">📄 {msg.retrievalInfo.documentsSearched} docs</span>
                          </div>
                        )}
                        
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="sources-section">
                            <div className="sources-title">📚 Sources</div>
                            <div className="sources-list">
                              {msg.sources.map((src: any, i: number) => (
                                <div key={i} className="source-card">
                                  <div className="source-top">
                                    <span className="source-file">📄 {src.filename}</span>
                                    {src.scores && (
                                      <span className="source-score">{src.scores.combined}</span>
                                    )}
                                  </div>
                                  <div className="source-text">"{src.text.substring(0, 180)}..."</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Contract Library */}
            {storedSessions.length > 0 && (
              <div className="library-section">
                <h2>📚 Your Contract Library</h2>
                <div className="library-grid">
                  {storedSessions.map((session, idx) => (
                    <div key={idx} className="library-card" onClick={() => handleLoadDocument(session)}>
                      <div className="card-icon">📄</div>
                      <div className="card-content">
                        <div className="card-title">{session.filename}</div>
                        <div className="card-meta">{session.chunkCount} chunks • Ready</div>
                      </div>
                      <div className="card-arrow">→</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Chat View */
          <div className="chat-view">
            <div className="chat-header">
              <div className="chat-title">
                <h3>📄 {documentName}</h3>
                <span className="chat-mode">Single Document Analysis</span>
              </div>
              <button className="back-button" onClick={handleNewDocument}>
                ← Back to Library
              </button>
            </div>

            <div className="chat-messages">
              {messages.map((msg, idx) => (
                <div key={idx} className={`chat-bubble ${msg.type}`}>
                  <div className="bubble-text">{msg.content}</div>
                  
                  {msg.retrievalInfo && (
                    <div className="info-pills">
                      <span className="pill">📊 {msg.retrievalInfo.initialRetrieved}</span>
                      <span className="pill">🎯 {msg.retrievalInfo.afterReranking}</span>
                    </div>
                  )}
                  
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="bubble-sources">
                      {msg.sources.map((src: any, i: number) => {
                        const text = typeof src === 'string' ? src : src.text;
                        const scores = typeof src === 'object' ? src.scores : null;
                        return (
                          <div key={i} className="bubble-source">
                            {scores && <span className="score">{scores.combined}</span>}
                            <div className="source-snippet">"{text.substring(0, 150)}..."</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              
              {isAnalyzing && (
                <div className="chat-bubble ai">
                  <div className="typing">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
            </div>

            <div className="chat-input-container">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask a question about this contract..."
                onKeyPress={(e) => e.key === 'Enter' && handleSendQuestion()}
                className="chat-input"
              />
              <button
                onClick={handleSendQuestion}
                disabled={!inputMessage.trim() || isAnalyzing}
                className="send-button"
              >
                ➤
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
