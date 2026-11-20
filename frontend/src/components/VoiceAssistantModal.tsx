import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  CheckCircle,
  Send,
  Loader2,
  Square,
  RotateCcw,
  Globe,
  Trash2,
  Bot,
  User,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { financeService } from '../services/financeService';
import type {
  CopilotChatMessage,
  CopilotChatResponse,
  PaymentMethod,
  TransactionCategory,
  TransactionInput,
  TransactionType,
  VoiceParseResponse,
  VoiceParsedTransaction,
} from '../types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PAYMENT_METHODS } from '../types';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmTransaction: (input: TransactionInput) => Promise<boolean>;
}

type AssistantState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';
type LanguageOption = 'auto' | 'en-IN' | 'hi-IN' | 'en-US';

interface VoiceDialogTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  detectedLang?: 'english' | 'hindi' | 'hinglish';
  timestamp: string;
}

interface SpeechRecognitionEvent extends Event {
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface ISpeechRecognition {
  start(): void;
  stop(): void;
  abort(): void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((err: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognition;
}

interface IWindowWithSpeech extends Window {
  webkitSpeechRecognition?: ISpeechRecognitionConstructor;
  SpeechRecognition?: ISpeechRecognitionConstructor;
}

const HINGLISH_KEYWORDS = new Set([
  'mera', 'meri', 'mere', 'kharcha', 'kharch', 'bachat', 'paisa', 'paise',
  'kitna', 'kitni', 'kitne', 'kahan', 'batao', 'aaya', 'aaye', 'aayi',
  'bache', 'baki', 'kya', 'hai', 'hain', 'kaise', 'karo', 'kare', 'mahine',
  'rupaye', 'rupayee', 'kamaya', 'diye', 'dekhna', 'dikhao', 'bataiye',
]);

function detectInputLanguage(text: string): 'english' | 'hindi' | 'hinglish' {
  if (/[\u0900-\u097F]/.test(text)) {
    return 'hindi';
  }
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  for (const w of words) {
    if (HINGLISH_KEYWORDS.has(w)) {
      return 'hinglish';
    }
  }
  return 'english';
}

const SUGGESTED_VOICE_PROMPTS = [
  { en: 'What is my current net balance?', hi: 'मेरा कुल बैलेंस कितना है?', hl: 'Mera current balance kitna hai?' },
  { en: 'Where did I spend the most this month?', hi: 'इस महीने सबसे ज्यादा खर्च कहाँ हुआ?', hl: 'Is mahine sabse jyada kharcha kahan hua?' },
  { en: 'Are any of my budgets exceeded?', hi: 'क्या कोई बजट सीमा पार हुई है?', hl: 'Kya koi budget limit cross hui hai?' },
  { en: 'How are my savings goals progressing?', hi: 'मेरे बचत लक्ष्यों की क्या स्थिति है?', hl: 'Savings goals ka kya progress hai?' },
];

export function VoiceAssistantModal({
  isOpen,
  onClose,
  onConfirmTransaction,
}: VoiceAssistantModalProps) {
  const isSpeechSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as IWindowWithSpeech).SpeechRecognition ||
        (window as unknown as IWindowWithSpeech).webkitSpeechRecognition,
    );

  const [state, setState] = useState<AssistantState>('IDLE');
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageOption>('auto');
  const [activeSpeechLang, setActiveSpeechLang] = useState<string>('en-IN');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [typedInput, setTypedInput] = useState('');
  const [ttsMuted, setTtsMuted] = useState(false);
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);

  const [history, setHistory] = useState<VoiceDialogTurn[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Namaste! I am your FINORA Voice Assistant. You can speak to me naturally in English, Hindi, or Hinglish.\n\nAsk about your balance, expenses, budgets, or record a transaction!',
      detectedLang: 'hinglish',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Transaction confirmation state
  const [pendingTx, setPendingTx] = useState<VoiceParsedTransaction | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<TransactionType>('expense');
  const [editCategory, setEditCategory] = useState<TransactionCategory>('Food');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('UPI');

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const turnCounterRef = useRef<number>(1);
  const speechBufferRef = useRef<string>('');
  const handleProcessInputRef = useRef<(inputText: string) => Promise<void>>(async () => {});

  const handleClose = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }
    setState('IDLE');
    setInterimTranscript('');
    onClose();
  }, [onClose]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, state, interimTranscript]);

  // Determine recognition language: if auto, adapt to turn or default to en-IN (handles EN & transliterated Hinglish)
  const effectiveRecLang = useMemo(() => {
    if (selectedLanguage !== 'auto') {
      return selectedLanguage;
    }
    return activeSpeechLang;
  }, [selectedLanguage, activeSpeechLang]);

  // Initialize SpeechRecognition instance
  useEffect(() => {
    if (!isSpeechSupported) return;

    const win = window as unknown as IWindowWithSpeech;
    const SpeechClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechClass) return;

    try {
      const recognition = new SpeechClass();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = effectiveRecLang;

      recognition.onstart = () => {
        setState('LISTENING');
        setMicErrorMessage(null);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let text = '';
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i][0];
          if (item) {
            text += item.transcript;
          }
        }
        if (text) {
          setInterimTranscript(text);
          speechBufferRef.current = text;
        }
      };

      recognition.onerror = (err: { error: string }) => {
        if (err.error === 'no-speech') {
          setState('IDLE');
        } else if (err.error === 'not-allowed') {
          setState('ERROR');
          setMicErrorMessage('Microphone access denied. Please allow microphone permission in your browser settings.');
        } else {
          setState('ERROR');
          setMicErrorMessage(`Microphone error: ${err.error}`);
        }
      };

      recognition.onend = () => {
        setInterimTranscript('');
        const captured = speechBufferRef.current.trim();
        speechBufferRef.current = '';
        if (captured.length > 0) {
          void handleProcessInputRef.current(captured);
        } else {
          setState('IDLE');
        }
      };

      recognitionRef.current = recognition;
    } catch {
      // Speech recognition not available
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore abort
        }
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [effectiveRecLang, isSpeechSupported]);

  // Text-To-Speech with voice matching by language
  const speakResponse = (text: string, lang: 'english' | 'hindi' | 'hinglish') => {
    if (ttsMuted || !('speechSynthesis' in window)) {
      setState('IDLE');
      return;
    }

    try {
      window.speechSynthesis.cancel();
      // Clean markdown tags for spoken output
      const cleanText = text
        .replace(/[*#_`~>•]/g, '')
        .replace(/\n+/g, '. ')
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      currentUtteranceRef.current = utterance;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        if (lang === 'hindi') {
          const hiVoice = voices.find((v) => v.lang.toLowerCase().startsWith('hi'));
          if (hiVoice) utterance.voice = hiVoice;
          utterance.lang = 'hi-IN';
        } else {
          // English or Hinglish: prefer Indian English voice if available
          const inVoice = voices.find((v) => v.lang.toLowerCase() === 'en-in');
          if (inVoice) {
            utterance.voice = inVoice;
          }
          utterance.lang = 'en-IN';
        }
      }

      utterance.onstart = () => {
        setState('SPEAKING');
      };

      utterance.onend = () => {
        setState('IDLE');
      };

      utterance.onerror = () => {
        setState('IDLE');
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      setState('IDLE');
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setState('IDLE');
  };

  const toggleListening = () => {
    if (state === 'SPEAKING') {
      stopSpeaking();
    }

    if (state === 'LISTENING') {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setState('IDLE');
      return;
    }

    speechBufferRef.current = '';
    setInterimTranscript('');
    setPendingTx(null);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch {
        try {
          recognitionRef.current.abort();
          setTimeout(() => recognitionRef.current?.start(), 150);
        } catch {
          toast.error('Unable to start speech recognition. Please check permissions.');
        }
      }
    } else {
      toast.error('Speech recognition is not supported in this browser. Please type your message below.');
    }
  };

  const handleProcessInput = async (inputText: string) => {
    const text = inputText.trim();
    if (!text) return;

    turnCounterRef.current += 1;
    const detectedLang = detectInputLanguage(text);

    // If Hindi input detected, update active recognition lang for subsequent turns if on Auto
    if (detectedLang === 'hindi' && selectedLanguage === 'auto') {
      setActiveSpeechLang('hi-IN');
    } else if (selectedLanguage === 'auto') {
      setActiveSpeechLang('en-IN');
    }

    // 1. Append user message to dialog
    const userTurn: VoiceDialogTurn = {
      id: `u-${turnCounterRef.current}`,
      role: 'user',
      content: text,
      detectedLang,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setHistory((prev) => [...prev, userTurn]);
    setTypedInput('');
    setState('THINKING');

    // 2. Check for Transaction Recording intent (e.g., "Spent 450 on lunch via UPI")
    const isTxIntent =
      /\b(spent|paid|record|add|received|got|kharch|kharcha|diye|kamaya|rupaye|rs|₹)\b/i.test(text) &&
      /\d+/.test(text);

    if (isTxIntent) {
      try {
        const parseRes: VoiceParseResponse = await financeService.parseVoiceCommand(text);
        if (parseRes.intent === 'add_transaction' && parseRes.parsed_transaction) {
          const tx = parseRes.parsed_transaction;
          setPendingTx(tx);
          setEditTitle(tx.title);
          setEditAmount(String(tx.amount));
          setEditType(tx.type);
          setEditCategory(tx.category);
          setEditPaymentMethod(tx.payment_method);

          turnCounterRef.current += 1;
          const assistTurn: VoiceDialogTurn = {
            id: `a-${turnCounterRef.current}`,
            role: 'assistant',
            content: parseRes.spoken_feedback,
            detectedLang,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setHistory((prev) => [...prev, assistTurn]);
          speakResponse(parseRes.spoken_feedback, detectedLang);
          return;
        }
      } catch {
        // Fallback to copilot if parsing fails
      }
    }

    // 3. Conversational Financial Query via existing Copilot backend
    try {
      const apiHistory: CopilotChatMessage[] = history
        .filter((h) => h.id !== 'welcome')
        .slice(-6)
        .map((h) => ({
          role: h.role,
          content: h.content,
        }));

      const copilotRes: CopilotChatResponse = await financeService.sendCopilotChat(text, apiHistory);
      turnCounterRef.current += 1;
      const assistTurn: VoiceDialogTurn = {
        id: `a-${turnCounterRef.current}`,
        role: 'assistant',
        content: copilotRes.reply,
        detectedLang,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setHistory((prev) => [...prev, assistTurn]);
      speakResponse(copilotRes.reply, detectedLang);
    } catch {
      turnCounterRef.current += 1;
      const errorReply =
        detectedLang === 'hindi'
          ? 'क्षमा करें, आपके वित्तीय रिकॉर्ड का विश्लेषण करते समय कोई त्रुटि हुई। कृपया पुनः प्रयास करें।'
          : detectedLang === 'hinglish'
            ? 'Sorry, aapka financial ledger process karte waqt issue aaya. Please dobara try karein.'
            : 'Sorry, I encountered an issue analyzing your financial ledger. Please try again.';

      const errorTurn: VoiceDialogTurn = {
        id: `err-${turnCounterRef.current}`,
        role: 'assistant',
        content: errorReply,
        detectedLang,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setHistory((prev) => [...prev, errorTurn]);
      speakResponse(errorReply, detectedLang);
    }
  };

  useEffect(() => {
    handleProcessInputRef.current = handleProcessInput;
  });

  // Safe manual transaction confirmation
  const handleConfirmTransaction = async () => {
    const numAmount = parseFloat(editAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Please enter a valid positive amount.');
      return;
    }
    if (!editTitle.trim()) {
      toast.error('Please specify a title for the transaction.');
      return;
    }

    const payload: TransactionInput = {
      title: editTitle.trim(),
      amount: numAmount,
      type: editType,
      category: editCategory,
      paymentMethod: editPaymentMethod,
      date: pendingTx?.date || new Date().toISOString().split('T')[0],
      description: pendingTx?.description || `Voice Assistant: "${editTitle}"`,
      status: 'completed',
    };

    const ok = await onConfirmTransaction(payload);
    if (ok) {
      toast.success(`Successfully saved ${editType} of ₹${numAmount.toLocaleString('en-IN')}`);
      setPendingTx(null);
      const confMsg = `Saved ${editType} of ₹${numAmount} for ${editCategory}.`;
      speakResponse(confMsg, 'english');
    }
  };

  const handleClearHistory = () => {
    turnCounterRef.current += 1;
    setHistory([
      {
        id: `reset-${turnCounterRef.current}`,
        role: 'assistant',
        content: 'Conversation history reset. How can I help you with your finances?',
        detectedLang: 'english',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setPendingTx(null);
    stopSpeaking();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(5, 5, 12, 0.75)',
        backdropFilter: 'blur(10px)',
        padding: '16px',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '620px',
          height: '90vh',
          maxHeight: '740px',
          backgroundColor: '#0F0E1E',
          borderRadius: '24px',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(23, 21, 46, 0.75)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 50%, #EC4899 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#F8FAFC' }}>
                FINORA AI Voice Assistant
              </div>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                Multilingual Conversational Ledger Intelligence
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Language Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Globe size={13} style={{ color: '#A78BFA' }} />
              <select
                className="input"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as LanguageOption)}
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  height: '28px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(15, 14, 30, 0.8)',
                  borderColor: 'rgba(139, 92, 246, 0.3)',
                  color: '#DDD6FE',
                }}
                title="Select Voice & Speech Language"
              >
                <option value="auto">Auto Detect</option>
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi (हिन्दी)</option>
                <option value="en-US">English (US)</option>
              </select>
            </div>

            {/* Audio Mute Toggle */}
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setTtsMuted((prev) => !prev);
                if (!ttsMuted) stopSpeaking();
              }}
              title={ttsMuted ? 'Unmute spoken responses' : 'Mute spoken responses'}
              style={{ color: ttsMuted ? '#F87171' : '#A78BFA' }}
            >
              {ttsMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>

            {/* Clear History */}
            <button
              type="button"
              className="icon-btn"
              onClick={handleClearHistory}
              title="Clear dialog history"
              style={{ color: '#94A3B8' }}
            >
              <Trash2 size={16} />
            </button>

            {/* Close */}
            <button
              type="button"
              className="icon-btn"
              onClick={handleClose}
              title="Close Voice Assistant (Esc)"
              style={{ color: '#94A3B8' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Ambient Visualizer & Active State Orb */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: 'rgba(23, 21, 46, 0.45)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Main Interactive Orb */}
            <button
              type="button"
              onClick={toggleListening}
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                backgroundColor:
                  state === 'LISTENING'
                    ? '#EF4444'
                    : state === 'SPEAKING'
                      ? '#10B981'
                      : state === 'THINKING'
                        ? '#6366F1'
                        : '#8B5CF6',
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow:
                  state === 'LISTENING'
                    ? '0 0 25px rgba(239, 68, 68, 0.7)'
                    : state === 'SPEAKING'
                      ? '0 0 22px rgba(16, 185, 129, 0.6)'
                      : '0 0 20px rgba(139, 92, 246, 0.5)',
                transition: 'all 0.25s ease',
                flexShrink: 0,
              }}
              title={
                state === 'LISTENING'
                  ? 'Click to stop listening'
                  : state === 'SPEAKING'
                    ? 'Click to interrupt/stop speaking'
                    : 'Click to start speaking'
              }
            >
              {state === 'LISTENING' ? (
                <MicOff size={24} />
              ) : state === 'THINKING' ? (
                <Loader2 size={24} className="spin" />
              ) : state === 'SPEAKING' ? (
                <Volume2 size={24} />
              ) : (
                <Mic size={24} />
              )}
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#F8FAFC' }}>
                  {state === 'LISTENING'
                    ? 'Listening... Speak naturally'
                    : state === 'THINKING'
                      ? 'Analyzing your financial records...'
                      : state === 'SPEAKING'
                        ? 'Speaking response...'
                        : 'Ready • Click mic or speak'}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(139, 92, 246, 0.15)',
                    color: '#DDD6FE',
                  }}
                >
                  {selectedLanguage === 'auto' ? 'Auto Language' : selectedLanguage}
                </span>
              </div>

              <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '2px' }}>
                {interimTranscript ? (
                  <span style={{ color: '#A78BFA', fontStyle: 'italic' }}>&ldquo;{interimTranscript}&rdquo;</span>
                ) : (
                  'Supports English, हिन्दी and Hinglish natively'
                )}
              </div>
            </div>
          </div>

          {/* Stop Speaking Control */}
          {state === 'SPEAKING' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={stopSpeaking}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11.5px',
                color: '#F87171',
                borderColor: 'rgba(239, 68, 68, 0.35)',
              }}
            >
              <Square size={12} fill="#F87171" />
              Stop Audio
            </button>
          )}
        </div>

        {/* Mic Permission Error Banner */}
        {micErrorMessage && (
          <div
            style={{
              padding: '10px 18px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#FCA5A5',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{micErrorMessage}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setMicErrorMessage(null)}
              style={{ color: '#FCA5A5', padding: '2px 8px', fontSize: '11px' }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Conversation Thread */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {history.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    maxWidth: '88%',
                    flexDirection: isUser ? 'row-reverse' : 'row',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: isUser ? '#8B5CF6' : 'rgba(139, 92, 246, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#F8FAFC',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    {isUser ? <User size={14} /> : <Bot size={15} />}
                  </div>

                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      backgroundColor: isUser ? '#7C3AED' : 'rgba(26, 24, 52, 0.85)',
                      border: isUser ? '1px solid #8B5CF6' : '1px solid rgba(139, 92, 246, 0.22)',
                      color: '#F8FAFC',
                      fontSize: '13px',
                      lineHeight: '1.55',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>

                {/* Subtext with Replay Button */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '10.5px',
                    color: '#64748B',
                    marginTop: '3px',
                    padding: isUser ? '0 36px 0 0' : '0 0 0 36px',
                  }}
                >
                  <span>{msg.timestamp}</span>
                  {msg.detectedLang && (
                    <span style={{ textTransform: 'capitalize' }}>• {msg.detectedLang}</span>
                  )}
                  {!isUser && msg.id !== 'welcome' && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => speakResponse(msg.content, msg.detectedLang || 'english')}
                      title="Replay Audio"
                      style={{ padding: 0, width: '20px', height: '20px', color: '#A78BFA' }}
                    >
                      <RotateCcw size={11} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pending Transaction Mandatory Confirmation Card */}
          {pendingTx && (
            <div
              style={{
                margin: '8px 0',
                padding: '18px',
                borderRadius: '16px',
                backgroundColor: 'rgba(23, 21, 46, 0.95)',
                border: '1px solid rgba(34, 197, 94, 0.45)',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={18} style={{ color: '#22C55E' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#86EFAC' }}>
                  Confirm Voice-Parsed Transaction
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
                FINORA never commits records without your confirmation. Review or adjust the parameters before saving:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#94A3B8' }}>Title</label>
                  <input
                    type="text"
                    className="input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{ fontSize: '12.5px', marginTop: '2px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94A3B8' }}>Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    style={{ fontSize: '12.5px', marginTop: '2px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94A3B8' }}>Type</label>
                  <select
                    className="input"
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as TransactionType)}
                    style={{ fontSize: '12.5px', marginTop: '2px' }}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94A3B8' }}>Category</label>
                  <select
                    className="input"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as TransactionCategory)}
                    style={{ fontSize: '12.5px', marginTop: '2px' }}
                  >
                    {(editType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '11px', color: '#94A3B8' }}>Payment Method</label>
                  <select
                    className="input"
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value as PaymentMethod)}
                    style={{ fontSize: '12.5px', marginTop: '2px' }}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPendingTx(null)}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void handleConfirmTransaction()}
                >
                  Confirm & Save
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Suggested Quick Prompt Pills */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            backgroundColor: 'rgba(15, 14, 30, 0.9)',
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          {SUGGESTED_VOICE_PROMPTS.map((p, idx) => {
            const promptLabel =
              selectedLanguage === 'hi-IN'
                ? p.hi
                : selectedLanguage === 'auto'
                  ? p.hl
                  : p.en;
            return (
              <button
                key={idx}
                type="button"
                style={{
                  padding: '5px 12px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(139, 92, 246, 0.15)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  color: '#DDD6FE',
                  fontSize: '11px',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                onClick={() => void handleProcessInput(promptLabel)}
              >
                {promptLabel}
              </button>
            );
          })}
        </div>

        {/* Bottom Input & Voice Trigger Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleProcessInput(typedInput);
          }}
          style={{
            padding: '14px 18px',
            borderTop: '1px solid rgba(139, 92, 246, 0.25)',
            backgroundColor: 'rgba(23, 21, 46, 0.95)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="input"
            value={typedInput}
            onChange={(e) => setTypedInput(e.target.value)}
            placeholder="Type or speak: 'Spent 500 on Food' or 'Mera balance kitna hai?'..."
            style={{
              flex: 1,
              backgroundColor: '#121124',
              borderColor: 'rgba(139, 92, 246, 0.35)',
              fontSize: '13px',
            }}
          />

          <button
            type="button"
            className={`btn ${state === 'LISTENING' ? 'btn-danger' : 'btn-primary'} btn-sm`}
            onClick={toggleListening}
            style={{ padding: '8px 12px' }}
            title="Toggle Microphone"
          >
            {state === 'LISTENING' ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          <button
            type="submit"
            className="btn btn-secondary btn-sm"
            disabled={!typedInput.trim()}
            style={{ padding: '8px 12px' }}
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}
