import React, { useState } from 'react';
import './App.css';

// Define types for our data
interface Message {
  type: 'user' | 'ai';
  content: string;
  sources?: string[];
}

interface UploadResponse {
  message: string;
  filename: string;
  chunkCount: number;
  sessionId: string;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [documentName, setDocumentName] = useState<string>('');

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  // Upload document to backend
  const handleUpload = async () => {
    if (!selectedFile) {
      addMessage('user', 'Please select a file first!');
      return;
    }

    setIsUploading(true);
    addMessage('user', `Uploading document: ${selectedFile.name}`);

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
        addMessage('ai', `✅ ${result.message} I found ${result.chunkCount} sections to analyze. I'm ready for your legal questions!`);
      } else {
        addMessage('ai', `❌ Upload failed: ${result.message}`);
      }
    } catch (error) {
      addMessage('ai', '❌ Upload failed! Please check if the backend server is running.');
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  // Send question to AI
  const handleSendQuestion = async () => {
    if (!inputMessage.trim() || !sessionId) return;

    const question = inputMessage.trim();
    setInputMessage('');
    addMessage('user', question);
    setIsAnalyzing(true);

    try {
      const response = await fetch('http://localhost:3001/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: question,
          sessionId: sessionId,
        }),
      });

      const result = await response.json();
      
      if (response.ok) {
        addMessage('ai', result.answer, result.sources);
      } else {
        addMessage('ai', `❌ Error: ${result.message}`);
      }
    } catch (error) {
      addMessage('ai', '❌ Failed to get response. Please try again.');
      console.error('Ask error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Add message to chat
  const addMessage = (type: 'user' | 'ai', content: string, sources?: string[]) => {
    setMessages(prev => [...prev, { type, content, sources }]);
  };

  // Clear chat and reset
  const handleNewDocument = () => {
    setSelectedFile(null);
    setMessages([]);
    setSessionId('');
    setDocumentName('');
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>⚖️ LegalLens AI</h1>
        <p>Your AI Legal Contract Analyzer</p>
      </header>

      <main className="app-main">
        {/* Document Upload Section */}
        {!sessionId && (
          <div className="upload-section">
            <div className="upload-card">
              <h2>📄 Analyze Legal Document</h2>
              <p>Upload a contract or legal document to begin analysis</p>
              
              <div className="file-input-container">
                <input 
                  type="file" 
                  id="file-upload"
                  onChange={handleFileChange}
                  accept=".pdf,.docx"
                  className="file-input"
                />
                <label htmlFor="file-upload" className="file-input-label">
                  {selectedFile ? selectedFile.name : 'Choose PDF or DOCX file'}
                </label>
              </div>

              <button 
                onClick={handleUpload} 
                disabled={!selectedFile || isUploading}
                className="upload-button"
              >
                {isUploading ? '⏳ Processing...' : '🔍 Analyze Document'}
              </button>
            </div>
          </div>
        )}

        {/* Chat Interface */}
        {sessionId && (
          <div className="chat-interface">
            <div className="chat-header">
              <h3>Analyzing: {documentName}</h3>
              <button onClick={handleNewDocument} className="new-doc-button">
                📄 New Document
              </button>
            </div>

            <div className="chat-messages">
              {messages.map((message, index) => (
                <div key={index} className={`message ${message.type}`}>
                  <div className="message-content">
                    {message.content}
                  </div>
                  {message.sources && message.sources.length > 0 && (
                    <div className="sources">
                      <strong>Relevant sections:</strong>
                      {message.sources.map((source, i) => (
                        <div key={i} className="source-text">
                          "{source.substring(0, 150)}..."
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              
              {isAnalyzing && (
                <div className="message ai">
                  <div className="message-content">
                    ⏳ Analyzing your legal question...
                  </div>
                </div>
              )}
            </div>

            <div className="chat-input">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask a legal question about this contract..."
                onKeyPress={(e) => e.key === 'Enter' && handleSendQuestion()}
                className="question-input"
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