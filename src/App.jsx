import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  Code,
  FileText,
  Heart,
  BookOpen,
  Gamepad2,
  Coffee,
  Paperclip,
  X,
  Clipboard,
  ClipboardCheck,
  Menu, // For sidebar toggle
  Sun, // For theme toggle
  Moon, // For theme toggle
  FlaskConical, // App logo
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- FIREBASE CONFIG (No changes here) ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// --- SECTIONS CONFIG (Extracted for clarity) ---
const sections = [
  { id: "study", name: "Study", icon: BookOpen },
  { id: "entertainment", name: "Entertainment", icon: Gamepad2 },
  { id: "fun", name: "Fun", icon: Coffee },
  { id: "love", name: "Lost", icon: Heart },
];

// --- MAIN APP COMPONENT ---
export default function LabChatApp() {
  // --- STATE MANAGEMENT ---
  const [activeSection, setActiveSection] = useState("study");
  const [messages, setMessages] = useState({});
  const [currentMessage, setCurrentMessage] = useState("");
  const [isAiMode, setIsAiMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState("light"); // 'light' or 'dark'

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // --- EFFECTS ---
  // Theme management effect
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Firebase message listener effect
  useEffect(() => {
    const messagesCollection = collection(db, `sections/${activeSection}/messages`);
    const q = query(messagesCollection, orderBy("timestamp", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sectionMessages = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
          timestamp:
            doc.data().timestamp?.toDate().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }) || "sending...",
        }))
        .reverse();
      setMessages((prev) => ({ ...prev, [activeSection]: sectionMessages }));
    });
    return () => unsubscribe();
  }, [activeSection]);

  // Auto-scroll effect
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [messages, isLoading]);


  // --- HANDLERS & HELPERS (No major logic changes, only clipboard) ---

  const handleCopyMessage = (textToCopy, messageId) => {
    if (!navigator.clipboard) {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand("copy");
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      } catch (err) {
        console.error("Fallback: Oops, unable to copy", err);
      }
      document.body.removeChild(textArea);
      return;
    }
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000); // Reset after 2 seconds
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files || []);
    const newFiles = files.map((file) => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      preview: file.type?.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setSelectedFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (fileId) => {
    setSelectedFiles((prev) => {
      const removed = prev.find((f) => f.id === fileId);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((f) => f.id !== fileId);
    });
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() && selectedFiles.length === 0) return;
    setIsLoading(true);

    const uploadedFiles = [];
    for (const selectedFile of selectedFiles) {
      const storageRef = ref(storage, `files/${Date.now()}-${selectedFile.name}`);
      try {
        const snapshot = await uploadBytes(storageRef, selectedFile.file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        uploadedFiles.push({
          name: selectedFile.name,
          type: selectedFile.type,
          url: downloadURL,
        });
      } catch (error) {
        console.error("Error uploading file:", error);
      }
    }

    const messageType = detectMessageType(currentMessage);
    const newMessage = {
      text: currentMessage,
      sender: isAiMode ? "ai" : "anonymous",
      type: messageType.type,
      iconName: messageType.icon ? messageType.icon.displayName : null,
      timestamp: serverTimestamp(),
      attachments: uploadedFiles,
    };

    const messagesCollection = collection(db, `sections/${activeSection}/messages`);
    await addDoc(messagesCollection, newMessage);

    const userMessage = currentMessage;
    setCurrentMessage("");
    setSelectedFiles([]);
    setIsLoading(false);

    if (isAiMode) {
      const aiResponseText = await getAiResponse(userMessage);
      const aiMessage = {
        text: aiResponseText,
        sender: "ai",
        type: "text",
        iconName: null,
        timestamp: serverTimestamp(),
        attachments: [],
      };
      await addDoc(messagesCollection, aiMessage);
    }
  };

  const detectMessageType = (text) => {
    const lowerText = (text || "").toLowerCase();
    if (lowerText.includes("def ") || lowerText.includes("print(")) return { type: "python", icon: Code };
    if (lowerText.includes("<div") || lowerText.includes("<!doctype")) return { type: "html", icon: Code };
    if (lowerText.includes("int main") || lowerText.includes("printf")) return { type: "c", icon: Code };
    if (lowerText.includes("select ") || lowerText.includes("sqlplus")) return { type: "sql", icon: Code };
    if (text && text.length > 200) return { type: "document", icon: FileText };
    return { type: "text", icon: null };
  };

  const getAiResponse = async (userMessage) => {
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 800));
    const lowerMessage = (userMessage || "").toLowerCase();
    if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) return "Hello there! How can I help you with your lab work today?";
    if (lowerMessage.includes("python")) return "I see you're working with Python. Remember to check your indentation! What seems to be the issue?";
    if (lowerMessage.includes("error")) return "Debugging is part of the process! Can you paste the full error message? That will help me analyze it.";
    return "That's an interesting point. Could you elaborate a bit more on what you're trying to achieve?";
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getIconComponent = (iconName) => {
    if (!iconName) return null;
    const icons = { Code, FileText };
    return icons[iconName.replace("Svg", "")] || null;
  };
  
  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  const activeSectionName = sections.find(s => s.id === activeSection)?.name || 'Chat';

  // --- RENDER ---
  return (
    <div className="app-container">
      {/* --- SIDEBAR --- */}
      <aside className={`sidebar ${isSidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-header">
          <FlaskConical size={28} />
          <h1>Lab Chat Hub</h1>
        </div>
        <nav className="sidebar-nav">
          {sections.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`section-button ${active ? "active" : ""}`}
              >
                <Icon size={18} />
                <span>{section.name}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
            <p>Anonymous collaboration space for lab students.</p>
        </div>
      </aside>
      
      {/* --- MAIN CONTENT --- */}
      <div className="main-content">
        <header className="app-header">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="icon-button sidebar-toggle">
                {isSidebarOpen ? <X size={20}/> : <Menu size={20} />}
            </button>
            <h2 className="header-title">{activeSectionName}</h2>
            <button onClick={toggleTheme} className="icon-button theme-toggle">
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20}/>}
            </button>
        </header>
        
        <main className="app-main">
            <div className="chat-card">
              <div className="messages-container">
                {(messages[activeSection] || []).map((message) => {
                  const IconComponent = getIconComponent(message.iconName);
                  const isCopied = copiedMessageId === message.id;
                  return (
                    <div key={message.id} className="message-row">
                      <div className={`avatar ${message.sender === "ai" ? "ai-avatar" : "user-avatar"}`}>
                        {message.sender === "ai" ? <Bot size={16} /> : <User size={16} />}
                      </div>
                      <div className="message-content">
                        <div className="message-header">
                          <span className={`sender-name ${message.sender === "ai" ? "ai-name" : "user-name"}`}>
                            {message.sender === "ai" ? "AI Assistant" : "Anonymous Student"}
                          </span>
                          <span className="timestamp">{message.timestamp}</span>
                          {IconComponent && (
                            <span className="message-type-badge">
                              <IconComponent size={12} />
                              {message.type.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className={`message-bubble ${message.sender === "ai" ? "ai-bubble" : "user-bubble"} ${message.type !== "text" ? "code-bubble" : ""}`}>
                          {message.text && <pre>{message.text}</pre>}
                          <MessageAttachments attachments={message.attachments} />
                        </div>
                      </div>
                      {message.text && (
                        <button
                          onClick={() => handleCopyMessage(message.text, message.id)}
                          className={`copy-button ${isCopied ? "copied" : ""}`}
                          title="Copy message"
                        >
                          {isCopied ? <ClipboardCheck size={14} /> : <Clipboard size={14} />}
                        </button>
                      )}
                    </div>
                  );
                })}
                {isLoading && (
                  <div className="message-row">
                    <div className="avatar ai-avatar"> <Bot size={16} /> </div>
                    <div className="message-bubble ai-bubble">
                      <div className="loading-indicator">
                        <div className="spinner" />
                        Processing...
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="input-area">
                {selectedFiles.length > 0 && (
                  <div className="file-preview-container">
                    <div className="file-preview-list">
                      {selectedFiles.map((file) => (
                        <div key={file.id} className="file-preview-item">
                          {file.preview ? (
                            <img src={file.preview} alt={file.name} className="file-image-preview" />
                          ) : (
                            <FileText size={16} className="file-icon-preview" />
                          )}
                          <div className="file-info">
                            <p className="file-name">{file.name}</p>
                            <p className="file-size">{formatFileSize(file.size)}</p>
                          </div>
                          <button onClick={() => removeFile(file.id)} className="remove-file-button">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="input-main-row">
                  <button onClick={() => fileInputRef.current?.click()} className="icon-button" title="Attach files">
                    <Paperclip size={18} />
                  </button>
                  <textarea
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Drop code, ask qs or start a discussion..."
                    className="text-input"
                    rows={1}
                  />
                  <label className="ai-toggle">
                    <button onClick={() => setIsAiMode(!isAiMode)} className={`toggle-switch ${isAiMode ? "active" : ""}`}>
                        <span className="toggle-slider" />
                    </button>
                    <span className="toggle-label">
                        {isAiMode ? <Bot size={14} /> : <User size={14} />}
                    </span>
                  </label>
                  <button
                    onClick={handleSendMessage}
                    disabled={(!currentMessage.trim() && selectedFiles.length === 0) || isLoading}
                    className="send-button"
                  >
                    <Send size={18} />
                  </button>
                </div>
                <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden-file-input" />
              </div>
            </div>
        </main>
      </div>
    </div>
  );
}


// --- SUB-COMPONENTS ---
const MessageAttachments = ({ attachments = [] }) => {
  if (!attachments.length) return null;
  return (
    <div className="attachments-grid">
      {attachments.map((file, index) => (
        <div key={index} className="attachment-item">
          {file.type.startsWith("image/") ? (
            <a href={file.url} target="_blank" rel="noopener noreferrer">
              <img src={file.url} alt={file.name} className="attachment-image" />
            </a>
          ) : (
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="attachment-file">
              <FileText size={24} />
              <span>{file.name}</span>
            </a>
          )}
        </div>
      ))}
    </div>
  );
};
