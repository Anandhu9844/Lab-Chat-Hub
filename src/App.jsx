import { useState, useRef, useEffect } from "react";
import {
  Send,
  User,
  Paperclip,
  X,
  Clipboard,
  ClipboardCheck,
  Menu, // Added for sidebar toggle
  Bot, // Retained for AI section
  Code, // For code block icon
  FileText, // For file icon
  Heart,
  BookOpen,
  Gamepad2,
  Coffee,
  FlaskConical,
  Sun,
  Moon,
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
import "./App.css"; // Ensure this path is correct

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

// --- SECTIONS CONFIG (Updated to use Lucide icons) ---
const sections = [
  { id: "study", name: "study", icon: BookOpen },
  { id: "entertainment", name: "Entertainment", icon: Gamepad2 },
  { id: "fun", name: "fun", icon: Gamepad2 },
  { id: "love", name: "lost", icon: Heart },
];

// --- MAIN APP COMPONENT ---
export default function LabChatApp() {
  // --- STATE MANAGEMENT ---
  const [activeSection, setActiveSection] = useState("study");
  const [messages, setMessages] = useState({});
  const [currentMessage, setCurrentMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Added sidebar state

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  // --- EFFECTS ---
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    const messagesCollection = collection(
      db,
      `sections/${activeSection}/messages`
    );
    const q = query(
      messagesCollection,
      orderBy("timestamp", "desc"),
      limit(50)
    );
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

  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [messages, isLoading]);

  // --- HANDLERS & HELPERS ---
  const handleCopyMessage = (textToCopy, messageId) => {
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
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
      preview: file.type?.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
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

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!currentMessage.trim() && selectedFiles.length === 0) return;
    setIsLoading(true);

    const uploadedFiles = [];
    for (const selectedFile of selectedFiles) {
      const storageRef = ref(
        storage,
        `files/${Date.now()}-${selectedFile.name}`
      );
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
      sender: "anonymous",
      type: messageType.type,
      language: messageType.language,
      timestamp: serverTimestamp(),
      attachments: uploadedFiles,
    };

    const messagesCollection = collection(
      db,
      `sections/${activeSection}/messages`
    );
    await addDoc(messagesCollection, newMessage);

    setCurrentMessage("");
    setSelectedFiles([]);
    setIsLoading(false);
  };

  const detectMessageType = (text) => {
    if (!text || text.trim() === "") return { type: "text", language: null };
    const lowerText = text.toLowerCase();

    // Check for code
    if (
      text.includes("`") ||
      lowerText.includes("{") ||
      lowerText.includes("function") ||
      lowerText.includes("const ") ||
      lowerText.includes("let ")
    )
      return { type: "code", language: "JavaScript/JSX" };
    if (
      lowerText.includes("def ") ||
      lowerText.includes("import ") ||
      lowerText.includes("elif ")
    )
      return { type: "code", language: "Python" };
    if (
      lowerText.includes("int main") ||
      lowerText.includes("cout <<") ||
      lowerText.includes("#include")
    )
      return { type: "code", language: "C++" };
    if (lowerText.includes("printf") || lowerText.includes("scanf"))
      return { type: "code", language: "C" };
    if (
      lowerText.includes("select ") ||
      lowerText.includes("insert into") ||
      lowerText.includes("where ")
    )
      return { type: "code", language: "SQL" };
    if (
      lowerText.includes("body {") ||
      lowerText.includes("font-family") ||
      lowerText.includes(".class")
    )
      return { type: "code", language: "CSS" };
    if (lowerText.includes("<div") || lowerText.includes("<!doctype"))
      return { type: "code", language: "HTML" };

    return { type: "text", language: null };
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const activeSectionName =
    sections.find((s) => s.id === activeSection)?.name || "Chat";

  return (
    <div className={`app ${isDark ? "dark" : "light"}`}>
      {/* Sidebar */}
      <div className={`sidebar ${isSidebarOpen ? "" : "closed"}`}>
        <div className="sidebar-header">
          <h1 className="logo">chat</h1>
          <span className="version">R</span>
        </div>
        <nav className="navigation">
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${
                  activeSection === item.id ? "active" : ""
                }`}
                onClick={() => setActiveSection(item.id)}
              >
                <span className="nav-icon">
                  <Icon size={16} />
                </span>
                <span className="nav-label">{item.name}</span>
              </button>
            );
          })}
        </nav>
        <div className="theme-toggle">
          <button
            className={`theme-btn ${!isDark ? "active" : ""}`}
            onClick={() => setIsDark(false)}
          >
            light
          </button>
          <button
            className={`theme-btn ${isDark ? "active" : ""}`}
            onClick={() => setIsDark(true)}
          >
            dark
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={`main-content ${isSidebarOpen ? "" : "full-width"}`}>
        <div className="header">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <Menu size={24} />
          </button>
          <h2 className="header-title">{activeSectionName}</h2>
        </div>
        <div className="messages-container">
          {(messages[activeSection] || []).map((message) => {
            const isCopied = copiedMessageId === message.id;
            return (
              <div key={message.id} className="message-container">
                <div className="message">
                  <div className="message-avatar">
                    <User size={16} />
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-user">Anonymous</span>
                      <span className="message-time">{message.timestamp}</span>
                    </div>
                    {message.type === "code" ? (
                      <CodeMessage
                        message={message}
                        onCopy={handleCopyMessage}
                        isCopied={isCopied}
                      />
                    ) : (
                      <div className="message-bubble">
                        <pre className="message-text">{message.text}</pre>
                        <MessageAttachments attachments={message.attachments} />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleCopyMessage(message.text, message.id)}
                    className={`copy-button ${isCopied ? "copied" : ""}`}
                    title="Copy message"
                  >
                    {isCopied ? (
                      <ClipboardCheck size={14} />
                    ) : (
                      <Clipboard size={14} />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="message-container">
              <div className="message">
                <div className="message-avatar">
                  <User size={16} />
                </div>
                <div className="message-content">
                  <div className="message-header">
                    <span className="message-user">Anonymous</span>
                    <span className="message-time">...</span>
                  </div>
                  <div className="message-bubble">
                    <div className="loading-indicator">
                      <div className="spinner" />
                      Processing...
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="input-container">
          {selectedFiles.length > 0 && (
            <div className="file-preview-list">
              {selectedFiles.map((file) => (
                <div key={file.id} className="file-preview-item">
                  {file.preview ? (
                    <img
                      src={file.preview}
                      alt={file.name}
                      className="file-image-preview"
                    />
                  ) : (
                    <Paperclip size={16} className="file-icon-preview" />
                  )}
                  <div className="file-info">
                    <p className="file-name">{file.name}</p>
                    <p className="file-size">{formatFileSize(file.size)}</p>
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    className="remove-file-button"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleSendMessage} className="input-form">
            <div className="input-wrapper">
              <button
                type="button"
                className="add-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                +
              </button>
              <textarea
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Drop code, ask qs or start a discussion..."
                className="message-input"
              />
              <button
                type="submit"
                className="send-btn"
                disabled={!currentMessage.trim() && selectedFiles.length === 0}
              >
                <Send size={20} />
              </button>
            </div>
            <div className="upload-info">
              <span>📎 Upload code files, documents, or images • </span>
              <a href="#" className="upload-link">
                Lab-manual
              </a>
              <span> • </span>
              <a
                href="https://code4labexam.vercel.app/"
                className="upload-link"
              >
                code4labexam
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---
const CodeMessage = ({ message, onCopy, isCopied }) => (
  <div className="code-container">
    <div className="code-header">
      <div className="code-type">
        <Code size={14} />
        <span>{message.language || "Code"}</span>
      </div>
      <button
        onClick={() => onCopy(message.text, message.id)}
        className={`copy-code-button ${isCopied ? "copied" : ""}`}
      >
        {isCopied ? (
          <>
            <ClipboardCheck size={14} />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Clipboard size={14} />
            <span>Copy code</span>
          </>
        )}
      </button>
    </div>
    <div className="code-content">
      <pre>{message.text}</pre>
    </div>
  </div>
);

const MessageAttachments = ({ attachments = [] }) => {
  if (!attachments.length) return null;
  return (
    <div className="attachments-grid">
      {attachments.map((file, index) => (
        <div key={index} className="attachment-item">
          {file.type.startsWith("image/") ? (
            <a href={file.url} target="_blank" rel="noopener noreferrer">
              <img
                src={file.url}
                alt={file.name}
                className="attachment-image"
              />
            </a>
          ) : (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="attachment-file"
            >
              <Paperclip size={24} />
              <span>{file.name}</span>
            </a>
          )}
        </div>
      ))}
    </div>
  );
};
