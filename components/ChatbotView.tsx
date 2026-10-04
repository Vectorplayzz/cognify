import React, { useState, useRef, useEffect, useCallback } from 'react';
import { aiService } from '../services/llamaService';
import * as api from '../services/apiService';
import { progressService } from '../services/progressService';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  persona?: string;
  personaColor?: string;
  senderName?: string;
  senderId?: number | null;
}

interface ChatSession {
  id: number;
  title: string;
  message_count: number;
  first_message?: string;
  created_at: string;
  updated_at: string;
}

interface Room {
  id: number;
  name: string;
  invite_code: string;
  member_count: number;
  last_message?: string;
  created_by: number;
}

interface RoomMember {
  id: number;
  name: string;
  picture?: string;
}

// AI Personas triggered via @mention
const PERSONAS = [
  { name: 'Socrates', icon: 'fa-scroll', color: 'from-amber-500 to-orange-600', textColor: 'text-amber-400', bgColor: 'bg-amber-500/10', prompt: 'You are Socrates, the ancient Greek philosopher. Teach through asking probing questions. Use the Socratic method. Be brief but thought-provoking.' },
  { name: 'Ada', icon: 'fa-microchip', color: 'from-pink-500 to-rose-600', textColor: 'text-pink-400', bgColor: 'bg-pink-500/10', prompt: 'You are Ada Lovelace, the first computer programmer. Explain things with precision and elegance. Focus on patterns and algorithms. Be concise.' },
  { name: 'Newton', icon: 'fa-apple-alt', color: 'from-emerald-500 to-green-600', textColor: 'text-emerald-400', bgColor: 'bg-emerald-500/10', prompt: 'You are Isaac Newton. Explain using first principles and scientific reasoning. Draw analogies to physics. Be methodical and brief.' },
  { name: 'Turing', icon: 'fa-cogs', color: 'from-blue-500 to-cyan-600', textColor: 'text-blue-400', bgColor: 'bg-blue-500/10', prompt: 'You are Alan Turing. Focus on computation, logic, and problem-solving. Think about edge cases. Be analytical and concise.' },
];

const TUTOR_PROMPT = "You are a senior AI Learning Tutor at Cognify. Explain complex AI concepts simply, use analogies, and encourage students. Be concise but thorough. IMPORTANT: You have access to the full conversation history above. Always reference previous context and remember what the user has told you or asked about earlier.";

type ChatMode = 'tutor' | 'rooms' | 'room-chat';

const ChatbotView: React.FC = () => {
  // ── Core state ──
  const [chatMode, setChatMode] = useState<ChatMode>('tutor');
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', text: 'Hello! I\'m your AI Learning Tutor powered by Kimi K2.5. Ask me anything about Machine Learning, Neural Networks, or help with your roadmap.' }
  ]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState(false);

  // ── Session state (ChatGPT-style) ──
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // ── Group chat state ──
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [roomMessages, setRoomMessages] = useState<Message[]>([]);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [createdInviteCode, setCreatedInviteCode] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  // ── Refs ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgIdRef = useRef<number>(0);
  const myUserIdRef = useRef<number | null>(null);

  // ── Initialize DB user ──
  useEffect(() => {
    const init = async () => {
      let userId = progressService.getDbUserId();

      // Always try to set user_name from stored Google data
      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const googleUser = JSON.parse(storedUser);
          if (googleUser.name) localStorage.setItem('user_name', googleUser.name);

          if (!userId && api.hasSession()) {
            // The account comes from the session established at sign-in.
            const dbUser = await api.getCurrentUser();
            localStorage.setItem('db_user_id', String(dbUser.id));
            userId = dbUser.id;
          }
        }
      } catch (err) {
        console.warn('[Chat] DB sync failed:', err);
      }

      myUserIdRef.current = userId;
      setDbReady(true);
      if (userId) console.log('[Chat] Ready, userId:', userId);
      else console.log('[Chat] Local mode (no login)');
    };
    init();
  }, []);

  // ── Load sessions when dbReady ──
  const loadSessions = useCallback(async () => {
    const userId = progressService.getDbUserId();
    if (!userId) return;
    setLoadingSessions(true);
    try {
      const data = await api.listChatSessions(userId);
      setSessions(data || []);
    } catch (err) {
      console.error('[Chat] Failed to load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    if (dbReady) loadSessions();
  }, [dbReady, loadSessions]);

  // ── Load rooms when switching to rooms mode ──
  useEffect(() => {
    if (chatMode === 'rooms' && dbReady) loadRooms();
  }, [chatMode, dbReady]);

  const loadRooms = async () => {
    const userId = progressService.getDbUserId();
    if (!userId) return;
    setLoadingRooms(true);
    try {
      const data = await api.getUserRooms(userId);
      setRooms(data || []);
    } catch (err) {
      console.error('[Chat] Failed to load rooms:', err);
    } finally {
      setLoadingRooms(false);
    }
  };

  // ── Auto-scroll ──
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, roomMessages, scrollToBottom]);

  // ── Polling for room messages ──
  useEffect(() => {
    if (chatMode === 'room-chat' && activeRoom) {
      const poll = async () => {
        try {
          const newMsgs = await api.getRoomMessages(activeRoom.id, lastMsgIdRef.current || undefined);
          if (newMsgs.length > 0) {
            const formatted: Message[] = newMsgs.map((m: any) => ({
              id: `room-${m.id}`,
              role: m.role as 'user' | 'assistant' | 'system',
              text: m.content,
              persona: m.persona,
              personaColor: m.persona ? PERSONAS.find(p => p.name === m.persona)?.textColor : undefined,
              senderName: m.sender_name,
              senderId: m.user_id,
            }));
            setRoomMessages(prev => [...prev, ...formatted]);
            lastMsgIdRef.current = Math.max(...newMsgs.map((m: any) => m.id));
          }
        } catch (err) { /* silently continue */ }
      };
      pollRef.current = setInterval(poll, 3000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [chatMode, activeRoom?.id]);

  // ── Speech Recognition ──
  const toggleListening = () => {
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Speech Recognition not supported. Use Chrome.'); return; }
    try {
      const recognition = new SR();
      recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
      let finalTranscript = '';
      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + ' ';
          else interim += event.results[i][0].transcript;
        }
        setInput((finalTranscript + interim).trim());
      };
      recognition.onend = () => { setIsListening(false); if (finalTranscript.trim()) { setInput(finalTranscript.trim()); inputRef.current?.focus(); } };
      recognition.onerror = (e: any) => { console.error('SR error:', e.error); setIsListening(false); };
      recognition.start(); recognitionRef.current = recognition; setIsListening(true);
    } catch (err) { console.error('SR fail:', err); }
  };

  // ── Speech Synthesis ──
  const toggleSpeak = (msgId: string, text: string) => {
    if (speakingMsgId === msgId) { window.speechSynthesis.cancel(); setSpeakingMsgId(null); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1;
    u.onend = () => setSpeakingMsgId(null); u.onerror = () => setSpeakingMsgId(null);
    synthRef.current = u;
    window.speechSynthesis.speak(u);
    setSpeakingMsgId(msgId);
  };
  useEffect(() => { return () => { window.speechSynthesis.cancel(); recognitionRef.current?.stop(); }; }, []);

  // ── @mention handling ──
  const parseMentions = (text: string): string[] => {
    const matches = text.match(/@(\w+)/g);
    if (!matches) return [];
    return matches.map(m => m.slice(1)).filter(n => PERSONAS.some(p => p.name.toLowerCase() === n.toLowerCase()));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    const lastAt = val.lastIndexOf('@');
    if (lastAt >= 0 && lastAt === val.length - 1) {
      setShowMentionDropdown(true); setMentionFilter('');
    } else if (lastAt >= 0 && !val.slice(lastAt + 1).includes(' ')) {
      setShowMentionDropdown(true); setMentionFilter(val.slice(lastAt + 1).toLowerCase());
    } else {
      setShowMentionDropdown(false);
    }
  };

  const insertMention = (name: string) => {
    const lastAt = input.lastIndexOf('@');
    setInput(input.slice(0, lastAt) + `@${name} `);
    setShowMentionDropdown(false);
    inputRef.current?.focus();
  };

  const filteredPersonas = PERSONAS.filter(p => !mentionFilter || p.name.toLowerCase().startsWith(mentionFilter));

  // ── Render markdown in messages ──
  const renderMd = (text: string) => {
    if (!text) return '\u00A0';
    let html = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-slate-800 text-indigo-300 text-xs font-mono">$1</code>');
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    return html;
  };

  // ══════════════════════════════════════════
  //  TUTOR: Session-based chat
  // ══════════════════════════════════════════

  const createNewSession = async () => {
    const userId = progressService.getDbUserId();
    if (!userId) {
      setMessages([{ id: `new-${Date.now()}`, role: 'assistant', text: 'Starting a new conversation. How can I help you today?' }]);
      setActiveSession(null);
      return;
    }
    try {
      const session = await api.createChatSession(userId);
      setActiveSession(session);
      setMessages([{ id: `new-${Date.now()}`, role: 'assistant', text: 'Starting a new conversation. How can I help you today?' }]);
      await loadSessions(); // refresh sidebar
    } catch (err) {
      console.error('[Chat] Failed to create session:', err);
    }
  };

  const loadSessionMessages = async (session: ChatSession) => {
    try {
      const msgs = await api.getSessionMessages(session.id);
      const formatted: Message[] = msgs.map((m: any, i: number) => ({
        id: `s-${m.id || i}`,
        role: m.role as 'user' | 'assistant',
        text: m.content,
      }));
      setMessages(formatted.length > 0 ? formatted : [
        { id: `empty-${Date.now()}`, role: 'assistant', text: 'This conversation is empty. Start chatting!' }
      ]);
      setActiveSession(session);
    } catch (err) {
      console.error('[Chat] Failed to load session:', err);
    }
  };

  const deleteSession = async (sessionId: number) => {
    try {
      await api.deleteChatSession(sessionId);
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
        setMessages([{ id: 'welcome', role: 'assistant', text: 'Hello! I\'m your AI Learning Tutor. Ask me anything!' }]);
      }
      await loadSessions();
    } catch (err) {
      console.error('[Chat] Failed to delete session:', err);
    }
  };

  // ── Send Message (tutor mode) ──
  const sendTutorMessage = async () => {
    if (!input.trim() || isGenerating) return;
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); }

    const userMsg = input.trim();
    setInput('');
    setIsGenerating(true);

    const userId = progressService.getDbUserId();

    // Auto-create a session if none active
    let currentSession = activeSession;
    if (userId && !currentSession) {
      try {
        currentSession = await api.createChatSession(userId);
        setActiveSession(currentSession);
      } catch (err) {
        console.error('[Chat] Failed to create session:', err);
      }
    }

    const userMessage: Message = { id: `user-${Date.now()}`, role: 'user', text: userMsg };
    const assistantPlaceholder: Message = { id: `asst-${Date.now()}`, role: 'assistant', text: '' };
    setMessages(prev => [...prev, userMessage, assistantPlaceholder]);

    // Save user message to DB
    if (userId && currentSession) {
      api.saveMessage({ user_id: userId, session_id: currentSession.id, role: 'user', content: userMsg })
        .catch(err => console.error('[Chat] Save user msg failed:', err));
    }

    try {
      const chatHistory = [...messages, userMessage].map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.text,
      }));

      let fullResponse = '';
      
      // Check if we should search (for UI indicator)
      const shouldSearch = aiService.shouldUseWebSearch(userMsg);
      if (shouldSearch) setIsSearching(true);
      
      await aiService.chatStream(
        chatHistory,
        (accumulated) => {
          fullResponse = accumulated;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], text: accumulated };
            return updated;
          });
        },
        TUTOR_PROMPT
      );
      setIsSearching(false);

      // Save assistant response to DB
      if (userId && currentSession && fullResponse) {
        api.saveMessage({ user_id: userId, session_id: currentSession.id, role: 'assistant', content: fullResponse })
          .then(() => loadSessions()) // update sidebar with potentially new title
          .catch(err => console.error('[Chat] Save asst msg failed:', err));
      }
    } catch (err) {
      console.error('[Chat] Error:', err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], text: 'Connection error. Make sure your AI server is running.' };
        return updated;
      });
    } finally {
      setIsGenerating(false);
      setIsSearching(false);
    }
  };

  // ══════════════════════════════════════════
  //  ROOMS: Group chat with @bot triggers
  // ══════════════════════════════════════════

  const sendRoomMessage = async () => {
    if (!input.trim() || isGenerating || !activeRoom) return;
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); }

    const userMsg = input.trim();
    setInput('');
    setShowMentionDropdown(false);

    const userId = progressService.getDbUserId();
    const userName = localStorage.getItem('user_name') || 'You';

    try {
      const saved = await api.postRoomMessage(activeRoom.id, {
        user_id: userId || undefined,
        sender_name: userName,
        content: userMsg,
        role: 'user',
      });
      const newMsg: Message = {
        id: `room-${saved.id}`, role: 'user', text: userMsg,
        senderName: userName, senderId: userId,
      };
      setRoomMessages(prev => [...prev, newMsg]);
      lastMsgIdRef.current = saved.id;
    } catch (err) {
      console.error('[Chat] Failed to send room message:', err);
      return;
    }

    // @mention bot triggers
    const mentionedBots = parseMentions(userMsg);
    if (mentionedBots.length > 0) {
      setIsGenerating(true);
      for (const botName of mentionedBots) {
        const persona = PERSONAS.find(p => p.name.toLowerCase() === botName.toLowerCase());
        if (!persona) continue;

        const placeholderId = `bot-${persona.name}-${Date.now()}`;
        setRoomMessages(prev => [...prev, {
          id: placeholderId, role: 'assistant', text: '', persona: persona.name,
          personaColor: persona.textColor, senderName: persona.name, senderId: null,
        }]);

        try {
          let fullResponse = '';
          await aiService.chatStream(
            [{ role: 'user' as const, content: userMsg }],
            (accumulated) => {
              fullResponse = accumulated;
              setRoomMessages(prev => {
                const updated = [...prev];
                const idx = updated.findIndex(m => m.id === placeholderId);
                if (idx >= 0) updated[idx] = { ...updated[idx], text: accumulated };
                return updated;
              });
            },
            persona.prompt
          );
          if (fullResponse) {
            const saved = await api.postRoomMessage(activeRoom.id, {
              sender_name: persona.name, content: fullResponse, role: 'bot', persona: persona.name,
            });
            setRoomMessages(prev => {
              const updated = [...prev];
              const idx = updated.findIndex(m => m.id === placeholderId);
              if (idx >= 0) updated[idx] = { ...updated[idx], id: `room-${saved.id}` };
              return updated;
            });
            lastMsgIdRef.current = saved.id;
          }
        } catch (err) {
          console.error(`[Chat] ${persona.name} bot error:`, err);
          setRoomMessages(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(m => m.id === placeholderId);
            if (idx >= 0) updated[idx] = { ...updated[idx], text: `${persona.name} is unavailable right now.` };
            return updated;
          });
        }
      }
      setIsGenerating(false);
    }
  };

  const sendMessage = chatMode === 'room-chat' ? sendRoomMessage : sendTutorMessage;

  // ── Room operations ──
  const handleCreateRoom = async () => {
    const userId = progressService.getDbUserId();
    if (!userId || !newRoomName.trim()) return;
    try {
      const room = await api.createRoom({ user_id: userId, name: newRoomName.trim() });
      setCreatedInviteCode(room.invite_code);
      setNewRoomName('');
      await loadRooms();
    } catch (err) { console.error('[Chat] Create room failed:', err); alert('Failed to create room.'); }
  };

  const handleJoinRoom = async () => {
    const userId = progressService.getDbUserId();
    if (!userId || !joinCode.trim()) return;
    try {
      await api.joinRoom({ user_id: userId, invite_code: joinCode.trim() });
      setJoinCode(''); setShowJoinRoom(false);
      await loadRooms();
    } catch (err: any) { alert('Invalid invite code.'); }
  };

  const enterRoom = async (room: Room) => {
    setActiveRoom(room); setChatMode('room-chat');
    lastMsgIdRef.current = 0; setRoomMessages([]);
    try {
      const msgs = await api.getRoomMessages(room.id);
      const formatted: Message[] = msgs.map((m: any) => ({
        id: `room-${m.id}`, role: m.role as 'user' | 'assistant' | 'system', text: m.content,
        persona: m.persona, personaColor: m.persona ? PERSONAS.find(p => p.name === m.persona)?.textColor : undefined,
        senderName: m.sender_name, senderId: m.user_id,
      }));
      setRoomMessages(formatted);
      if (msgs.length > 0) lastMsgIdRef.current = Math.max(...msgs.map((m: any) => m.id));
      const details = await api.getRoomDetails(room.id);
      setRoomMembers(details.members || []);
    } catch (err) { console.error('[Chat] Load room failed:', err); }
  };

  const handleRegenerateCode = async () => {
    if (!activeRoom) return;
    try {
      const updated = await api.regenerateInviteCode(activeRoom.id);
      setActiveRoom({ ...activeRoom, invite_code: updated.invite_code });
    } catch (err) { console.error('[Chat] Regen code failed:', err); }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => { setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); });
  };

  const handleClearChat = async () => {
    if (!confirm('Clear ALL chat history? This cannot be undone.')) return;
    const userId = progressService.getDbUserId();
    if (userId) try { await api.clearAllChat(userId); } catch (err) { console.error('Clear failed:', err); }
    setMessages([{ id: 'cleared', role: 'assistant', text: 'Chat cleared. How can I help you?' }]);
    setSessions([]); setActiveSession(null);
  };

  // ── Date grouping for sessions ──
  const groupSessionsByDate = (sessions: ChatSession[]) => {
    const groups: { label: string; sessions: ChatSession[] }[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const todayList: ChatSession[] = [];
    const yesterdayList: ChatSession[] = [];
    const weekList: ChatSession[] = [];
    const olderList: ChatSession[] = [];

    for (const s of sessions) {
      const d = new Date(s.updated_at);
      if (d >= today) todayList.push(s);
      else if (d >= yesterday) yesterdayList.push(s);
      else if (d >= weekAgo) weekList.push(s);
      else olderList.push(s);
    }

    if (todayList.length) groups.push({ label: 'Today', sessions: todayList });
    if (yesterdayList.length) groups.push({ label: 'Yesterday', sessions: yesterdayList });
    if (weekList.length) groups.push({ label: 'This Week', sessions: weekList });
    if (olderList.length) groups.push({ label: 'Older', sessions: olderList });
    return groups;
  };

  const activeMessages = chatMode === 'room-chat' ? roomMessages : messages;
  const myUserId = myUserIdRef.current;

  // ══════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════

  return (
    <div className="h-full flex relative">
      {/* ═══ LEFT SIDEBAR — ChatGPT-style sessions ═══ */}
      {chatMode === 'tutor' && (
        <div className="hidden md:flex w-64 flex-col bg-slate-900/80 border-r border-slate-800/50">
          {/* New Chat button */}
          <div className="p-3">
            <button
              onClick={createNewSession}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 text-slate-300 hover:text-white text-sm font-medium transition-all border border-slate-700/50 hover:border-slate-600"
            >
              <i className="fas fa-plus text-xs"></i>
              New Chat
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto sidebar-scroll px-2 pb-2">
            {loadingSessions ? (
              <div className="text-center py-8"><i className="fas fa-circle-notch animate-spin text-slate-600"></i></div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-10">
                <i className="fas fa-comments text-2xl text-slate-700 mb-2 block"></i>
                <p className="text-xs text-slate-600">No conversations yet</p>
              </div>
            ) : (
              groupSessionsByDate(sessions).map(group => (
                <div key={group.label} className="mb-3">
                  <p className="px-2 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{group.label}</p>
                  {group.sessions.map(session => (
                    <div
                      key={session.id}
                      className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all mb-0.5 ${activeSession?.id === session.id
                        ? 'bg-slate-700/60 text-white'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                        }`}
                      onClick={() => loadSessionMessages(session)}
                    >
                      <p className="flex-1 text-xs truncate">
                        {session.first_message || session.title || 'New Chat'}
                      </p>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-0.5"
                        title="Delete"
                      >
                        <i className="fas fa-trash-alt text-[9px]"></i>
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Bottom: clear all */}
          {sessions.length > 0 && (
            <div className="p-2 border-t border-slate-800/50">
              <button onClick={handleClearChat} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all">
                <i className="fas fa-trash-alt text-[10px]"></i>
                Clear all chats
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ MAIN CHAT AREA ═══ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-slate-800/50">
          <div className="flex items-center gap-3">
            {chatMode === 'room-chat' && activeRoom ? (
              <>
                <button onClick={() => { setChatMode('rooms'); setActiveRoom(null); if (pollRef.current) clearInterval(pollRef.current); }}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all">
                  <i className="fas fa-arrow-left text-xs"></i>
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{activeRoom.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded-md">{roomMembers.length} members</span>
                  </div>
                  <span className="text-[10px] text-slate-500">Type @BotName to summon AI personas</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 online-pulse"></div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {chatMode === 'rooms' ? 'Group Chats' : 'AI Tutor'}
                  </span>
                </div>
                {chatMode === 'tutor' && (
                  <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 font-semibold">Kimi K2.5</span>
                )}
                {dbReady && !myUserId && (
                  <span className="text-[10px] px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded-full" title="Sign in via Dashboard">Local mode</span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {chatMode === 'tutor' && (
              <>
                <button onClick={createNewSession} className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-400 hover:text-white border border-slate-700/50 transition-all" title="New Chat">
                  <i className="fas fa-plus text-[10px]"></i>
                </button>
              </>
            )}
            {chatMode === 'room-chat' && activeRoom && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => copyCode(activeRoom.invite_code)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-400 hover:text-white border border-slate-700/50 transition-all" title="Copy invite code">
                  <i className={`fas ${codeCopied ? 'fa-check text-emerald-400' : 'fa-copy'} text-[10px]`}></i>
                  <span className="font-mono">{activeRoom.invite_code}</span>
                </button>
                <button onClick={handleRegenerateCode} className="p-1.5 text-xs text-slate-500 hover:text-yellow-400 transition-colors" title="Regenerate code">
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>
            )}
            {/* Mode Toggle */}
            <button onClick={() => {
              if (chatMode === 'tutor') setChatMode('rooms');
              else { setChatMode('tutor'); setActiveRoom(null); if (pollRef.current) clearInterval(pollRef.current); }
            }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${chatMode !== 'tutor'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-slate-800/50 text-slate-400 hover:text-white border border-slate-700/50'}`}
            >
              <i className="fas fa-users text-[10px]"></i>
              <span className="hidden sm:inline">{chatMode !== 'tutor' ? 'Tutor' : 'Groups'}</span>
            </button>
          </div>
        </div>

        {/* ═══ ROOMS LIST VIEW ═══ */}
        {chatMode === 'rooms' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 sidebar-scroll">
            <div className="flex gap-3 mb-6">
              <button onClick={() => { setShowCreateRoom(true); setShowJoinRoom(false); setCreatedInviteCode(''); }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm hover:shadow-lg hover:shadow-indigo-500/25 transition-all flex items-center justify-center gap-2">
                <i className="fas fa-plus"></i> Create Room
              </button>
              <button onClick={() => { setShowJoinRoom(true); setShowCreateRoom(false); }}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-700 border border-slate-700 transition-all flex items-center justify-center gap-2">
                <i className="fas fa-sign-in-alt"></i> Join Room
              </button>
            </div>

            {/* Create Room Dialog */}
            {showCreateRoom && (
              <div className="mb-6 p-5 rounded-2xl bg-slate-800/80 border border-slate-700 animate-fade-in-up">
                <h3 className="text-sm font-bold text-white mb-3"><i className="fas fa-plus-circle text-indigo-400 mr-2"></i>Create a Group Chat</h3>
                <div className="flex gap-2 mb-3">
                  <input type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)}
                    placeholder="Room name (e.g. ML Study Group)"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-600/50 placeholder:text-slate-500"
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateRoom(); }} />
                  <button onClick={handleCreateRoom} disabled={!newRoomName.trim()}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white text-sm font-bold transition-all">Create</button>
                </div>
                {createdInviteCode && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-emerald-400 font-bold mb-1"><i className="fas fa-check-circle mr-1"></i> Room created!</p>
                      <p className="text-xs text-slate-400">Share this invite code:</p>
                    </div>
                    <button onClick={() => copyCode(createdInviteCode)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 transition-all">
                      <span className="text-lg font-mono font-black text-emerald-300 tracking-widest">{createdInviteCode}</span>
                      <i className={`fas ${codeCopied ? 'fa-check text-emerald-400' : 'fa-copy text-slate-400'}`}></i>
                    </button>
                  </div>
                )}
                <button onClick={() => setShowCreateRoom(false)} className="mt-2 text-xs text-slate-500 hover:text-white transition-colors">Cancel</button>
              </div>
            )}

            {/* Join Room Dialog */}
            {showJoinRoom && (
              <div className="mb-6 p-5 rounded-2xl bg-slate-800/80 border border-slate-700 animate-fade-in-up">
                <h3 className="text-sm font-bold text-white mb-3"><i className="fas fa-sign-in-alt text-purple-400 mr-2"></i>Join with Invite Code</h3>
                <div className="flex gap-2">
                  <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Paste invite code" maxLength={8}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-purple-600/50 placeholder:text-slate-500 placeholder:tracking-normal placeholder:font-sans"
                    onKeyDown={e => { if (e.key === 'Enter') handleJoinRoom(); }} />
                  <button onClick={handleJoinRoom} disabled={!joinCode.trim()}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 text-white text-sm font-bold transition-all">Join</button>
                </div>
                <button onClick={() => setShowJoinRoom(false)} className="mt-2 text-xs text-slate-500 hover:text-white transition-colors">Cancel</button>
              </div>
            )}

            {/* Room List */}
            {loadingRooms ? (
              <div className="text-center py-12"><i className="fas fa-circle-notch animate-spin text-indigo-400 text-xl"></i></div>
            ) : rooms.length === 0 ? (
              <div className="text-center py-16 bg-slate-800/30 rounded-2xl border border-slate-700/50 border-dashed">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-users text-slate-600 text-2xl"></i>
                </div>
                <p className="text-slate-400 font-semibold">No group chats yet</p>
                <p className="text-sm text-slate-500 mt-1">Create a room or join with an invite code</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rooms.map(room => (
                  <button key={room.id} onClick={() => enterRoom(room)}
                    className="w-full text-left p-4 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-indigo-500/30 transition-all group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">{room.name}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-slate-700 text-slate-400 rounded-full">{room.member_count} members</span>
                    </div>
                    {room.last_message && <p className="text-xs text-slate-500 truncate">{room.last_message}</p>}
                  </button>
                ))}
              </div>
            )}

            {/* Bot personas info */}
            <div className="mt-8 p-4 rounded-2xl bg-slate-800/30 border border-slate-700/50">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3"><i className="fas fa-robot mr-1.5"></i>Available AI Personas</h4>
              <p className="text-[10px] text-slate-500 mb-3">Use @Name in any group chat to summon a bot</p>
              <div className="flex flex-wrap gap-2">
                {PERSONAS.map(p => (
                  <div key={p.name} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-gradient-to-r ${p.color} bg-opacity-10 border border-white/10`}>
                    <i className={`fas ${p.icon} text-white text-[9px]`}></i>
                    <span className="text-[10px] font-bold text-white">@{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ MESSAGES VIEW ═══ */}
        {chatMode !== 'rooms' && (
          <>
            {/* Room members bar */}
            {chatMode === 'room-chat' && roomMembers.length > 0 && (
              <div className="px-4 py-2 border-b border-slate-800/30 flex items-center gap-2 overflow-x-auto">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider whitespace-nowrap">Online:</span>
                {roomMembers.map(m => (
                  <div key={m.id} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800/50 border border-slate-700/50">
                    {m.picture ? <img src={m.picture} alt="" className="w-4 h-4 rounded-full" /> :
                      <div className="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center"><span className="text-[8px] text-white font-bold">{m.name.charAt(0)}</span></div>}
                    <span className="text-[10px] font-semibold text-slate-300">{String(m.id) === String(myUserId) ? 'You' : m.name}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1 ml-2">
                  {PERSONAS.map(p => (
                    <div key={p.name} className={`w-5 h-5 rounded-md bg-gradient-to-br ${p.color} flex items-center justify-center`} title={`@${p.name}`}>
                      <i className={`fas ${p.icon} text-white text-[7px]`}></i>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 sidebar-scroll">
              {activeMessages.map((m, i) => {
                // System messages (join notifications)
                if (m.role === 'system') {
                  return (
                    <div key={m.id} className="text-center py-1">
                      <span className="text-[10px] text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">{m.text}</span>
                    </div>
                  );
                }

                // Determine if this is MY message
                const isMyMessage = chatMode === 'room-chat'
                  ? (m.role === 'user' && String(m.senderId) === String(myUserId))
                  : m.role === 'user';
                const isBot = m.role === 'assistant' || m.role === 'bot' || !!m.persona;
                const isOtherUser = chatMode === 'room-chat' && m.role === 'user' && !isMyMessage;

                return (
                  <div key={m.id} className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                    <div className={`max-w-[85%] md:max-w-[70%] relative group`}>
                      {/* Sender name (other users and bots only) */}
                      {!isMyMessage && (m.persona || (chatMode === 'room-chat' && m.senderName)) && (
                        <div className="flex items-center gap-1.5 mb-1 ml-1">
                          {m.persona ? (() => {
                            const p = PERSONAS.find(p => p.name === m.persona);
                            return p ? (
                              <>
                                <div className={`w-5 h-5 rounded-md bg-gradient-to-br ${p.color} flex items-center justify-center`}>
                                  <i className={`fas ${p.icon} text-white text-[8px]`}></i>
                                </div>
                                <span className={`text-xs font-bold ${p.textColor}`}>{p.name}</span>
                              </>
                            ) : null;
                          })() : isOtherUser ? (
                            <>
                              <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center">
                                <span className="text-[8px] text-white font-bold">{(m.senderName || '?').charAt(0)}</span>
                              </div>
                              <span className="text-xs font-semibold text-indigo-300">{m.senderName}</span>
                            </>
                          ) : null}
                        </div>
                      )}

                      {/* Tutor mode: show bot label */}
                      {chatMode === 'tutor' && isBot && (
                        <div className="flex items-center gap-1.5 mb-1 ml-1">
                          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                            <i className="fas fa-brain text-white text-[8px]"></i>
                          </div>
                          <span className="text-xs font-bold text-indigo-400">Cognify AI</span>
                        </div>
                      )}

                      <div className={`rounded-2xl px-4 py-3 ${isMyMessage
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : isOtherUser
                          ? 'bg-slate-700/60 text-slate-200 rounded-bl-sm'
                          : 'bg-slate-800/60 text-slate-200 rounded-bl-sm border border-slate-700/50'
                        }`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap"
                          dangerouslySetInnerHTML={{ __html: renderMd(m.text) || '\u00A0' }} />
                        {isGenerating && i === activeMessages.length - 1 && isBot && !m.text && (
                          <>
                            {isSearching && (
                              <span className="inline-flex items-center gap-1 ml-1 text-xs text-indigo-400">
                                <i className="fas fa-globe animate-pulse"></i>
                                Searching web...
                              </span>
                            )}
                            <span className="inline-flex gap-1 ml-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            </span>
                          </>
                        )}
                        {isGenerating && isBot && m.text && i >= activeMessages.length - (chatMode === 'room-chat' ? PERSONAS.length : 1) && (
                          <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 rounded-sm align-text-bottom animate-pulse"></span>
                        )}
                      </div>

                      {/* Speaker button for bot messages */}
                      {isBot && m.text && !isGenerating && (
                        <button onClick={() => toggleSpeak(m.id, m.text)}
                          className={`absolute -bottom-1 left-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-[10px] ${speakingMsgId === m.id ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-white bg-slate-800/80'
                            }`} title={speakingMsgId === m.id ? 'Stop' : 'Read aloud'}>
                          <i className={`fas ${speakingMsgId === m.id ? 'fa-pause' : 'fa-volume-up'}`}></i>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div className="p-3 md:p-4 border-t border-slate-800/50">
              <div className="relative flex items-center gap-2">
                <button onClick={toggleListening}
                  className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isListening ? 'bg-red-500 text-white mic-recording shadow-lg shadow-red-500/30'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'}`}
                  title={isListening ? 'Stop' : 'Voice input'}>
                  <i className={`fas ${isListening ? 'fa-stop' : 'fa-microphone'} text-sm`}></i>
                </button>

                <div className="flex-1 relative">
                  <input ref={inputRef} type="text" value={input} onChange={handleInputChange}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder={isListening ? 'Listening...' : chatMode === 'room-chat' ? 'Message... type @ to mention a bot' : 'Ask anything...'}
                    disabled={isGenerating}
                    className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 pr-12 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600/50 transition-all placeholder:text-slate-500 disabled:opacity-40" />

                  {/* @mention dropdown */}
                  {showMentionDropdown && filteredPersonas.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-30">
                      <div className="px-3 py-1.5 border-b border-slate-700">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Mention a bot</span>
                      </div>
                      {filteredPersonas.map(p => (
                        <button key={p.name} onClick={() => insertMention(p.name)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-700/50 transition-colors text-left">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center`}>
                            <i className={`fas ${p.icon} text-white text-[10px]`}></i>
                          </div>
                          <p className="text-xs font-bold text-white">@{p.name}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  <button onClick={sendMessage} disabled={isGenerating || !input.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-40">
                    <i className={`fas ${isGenerating ? 'fa-circle-notch animate-spin' : 'fa-paper-plane'} text-xs`}></i>
                  </button>
                </div>
              </div>
              {isListening && (
                <div className="mt-2 flex items-center gap-2 text-xs text-red-400 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  Recording — click Stop or press Enter to send
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ═══ MOBILE SESSION DRAWER (for small screens in tutor mode) ═══ */}
      {chatMode === 'tutor' && (
        <div className="md:hidden fixed bottom-20 right-4 z-30">
          <details className="group">
            <summary className="w-10 h-10 rounded-full bg-indigo-600 shadow-lg flex items-center justify-center cursor-pointer list-none">
              <i className="fas fa-history text-white text-sm"></i>
            </summary>
            <div className="absolute bottom-12 right-0 w-64 max-h-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-y-auto sidebar-scroll p-2">
              <button onClick={createNewSession} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium mb-2">
                <i className="fas fa-plus text-[10px]"></i> New Chat
              </button>
              {sessions.map(s => (
                <button key={s.id} onClick={() => { loadSessionMessages(s); }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate mb-0.5 ${activeSession?.id === s.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                  {s.first_message || s.title}
                </button>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

export default ChatbotView;
