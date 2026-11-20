import { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  CheckCircle,
  ArrowRight,
  Send,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { financeService } from '../services/financeService';
import type {
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

// Global declaration for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: {
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

export function VoiceAssistantModal({
  isOpen,
  onClose,
  onConfirmTransaction,
}: VoiceAssistantModalProps) {
  const isSupportedInitial =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as IWindowWithSpeech).SpeechRecognition ||
        (window as unknown as IWindowWithSpeech).webkitSpeechRecognition,
    );

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [typedInput, setTypedInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [ttsMuted, setTtsMuted] = useState(false);
  const [speechSupported] = useState(isSupportedInitial);

  // Confirmation state for parsed transaction
  const [pendingTx, setPendingTx] = useState<VoiceParsedTransaction | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<TransactionType>('expense');
  const [editCategory, setEditCategory] = useState<TransactionCategory>('Food');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('UPI');

  // Query response state
  const [queryResponse, setQueryResponse] = useState<string | null>(null);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const win = window as unknown as IWindowWithSpeech;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // Default to Indian English / English

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
      };

      recognition.onerror = (err: { error: string }) => {
        setIsListening(false);
        if (err.error !== 'no-speech') {
          toast.error(`Microphone error: ${err.error || 'Permission denied'}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (e: unknown) {
      console.warn('Speech recognition init error:', e);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore cleanup abort
        }
      }
    };
  }, []);

  const speakText = (text: string) => {
    if (ttsMuted || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore TTS error
    }
  };

  const startListening = () => {
    setQueryResponse(null);
    setPendingTx(null);
    setTranscript('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch {
        recognitionRef.current.abort();
        setTimeout(() => {
          try {
            recognitionRef.current?.start();
          } catch {
            // ignore retry error
          }
        }, 150);
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore stop error
      }
    }
    setIsListening(false);
  };

  const handleProcessTranscript = async (textToProcess: string) => {
    const text = textToProcess.trim();
    if (!text || processing) return;

    setProcessing(true);
    setPendingTx(null);
    setQueryResponse(null);

    try {
      const res: VoiceParseResponse = await financeService.parseVoiceCommand(text);

      if (res.intent === 'add_transaction' && res.parsed_transaction) {
        const tx = res.parsed_transaction;
        setPendingTx(tx);
        setEditTitle(tx.title);
        setEditAmount(String(tx.amount));
        setEditType(tx.type);
        setEditCategory(tx.category);
        setEditPaymentMethod(tx.payment_method);
        speakText(res.spoken_feedback);
      } else {
        const reply = res.spoken_feedback || res.direct_reply || 'Command processed.';
        setQueryResponse(reply);
        speakText(reply);
      }
    } catch {
      const err = 'Failed to interpret voice command. Please try again.';
      setQueryResponse(err);
      speakText(err);
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmTransaction = async () => {
    const numericAmount = parseFloat(editAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast.error('Please enter a valid positive transaction amount.');
      return;
    }
    if (!editTitle.trim()) {
      toast.error('Please specify a title for the transaction.');
      return;
    }

    const payload: TransactionInput = {
      title: editTitle.trim(),
      amount: numericAmount,
      type: editType,
      category: editCategory,
      paymentMethod: editPaymentMethod,
      date: pendingTx?.date || new Date().toISOString().split('T')[0],
      description: pendingTx?.description || `Voice command: "${transcript || typedInput}"`,
      status: 'completed',
    };

    const ok = await onConfirmTransaction(payload);
    if (ok) {
      toast.success(`Recorded ${editType} of ₹${numericAmount.toLocaleString('en-IN')}`);
      speakText(`Recorded ${editType} of ₹${numericAmount} for ${editCategory}.`);
      setPendingTx(null);
      setTranscript('');
      setTypedInput('');
      onClose();
    }
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
        backdropFilter: 'blur(8px)',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#0F0E1E',
          borderRadius: '20px',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(23, 21, 46, 0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              <Mic size={18} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC' }}>
                Voice Finance Assistant
              </div>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                Hands-Free Ledger Entry & Real-Time Inquiries
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTtsMuted((prev) => !prev)}
              title={ttsMuted ? 'Unmute voice feedback' : 'Mute voice feedback'}
              style={{ color: ttsMuted ? '#F87171' : '#A78BFA' }}
            >
              {ttsMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              title="Close"
              style={{ color: '#94A3B8' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Listening Pulse Visualizer */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 16px',
              backgroundColor: 'rgba(23, 21, 46, 0.45)',
              borderRadius: '16px',
              border: isListening
                ? '1px solid #8B5CF6'
                : '1px solid rgba(139, 92, 246, 0.2)',
              position: 'relative',
            }}
          >
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '50%',
                backgroundColor: isListening ? '#EF4444' : '#8B5CF6',
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isListening
                  ? '0 0 25px rgba(239, 68, 68, 0.7)'
                  : '0 0 20px rgba(139, 92, 246, 0.5)',
                transition: 'all 0.25s ease',
              }}
            >
              {isListening ? <MicOff size={32} /> : <Mic size={32} />}
            </button>

            <span
              style={{
                marginTop: '12px',
                fontSize: '13px',
                fontWeight: 600,
                color: isListening ? '#F87171' : '#DDD6FE',
              }}
            >
              {isListening
                ? 'Listening... Speak now'
                : speechSupported
                  ? 'Click to speak a transaction or query'
                  : 'Microphone not supported in this browser'}
            </span>

            {/* Transcript Preview */}
            <div
              style={{
                marginTop: '10px',
                minHeight: '36px',
                padding: '8px 14px',
                backgroundColor: 'rgba(15, 14, 30, 0.8)',
                borderRadius: '8px',
                width: '100%',
                textAlign: 'center',
                fontSize: '12.5px',
                color: transcript ? '#F8FAFC' : '#64748B',
                fontStyle: transcript ? 'normal' : 'italic',
              }}
            >
              {transcript || 'e.g., "Spent 450 rupees on dinner at Dominos via UPI"'}
            </div>

            {transcript && !isListening && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void handleProcessTranscript(transcript)}
                disabled={processing}
                style={{ marginTop: '12px' }}
              >
                {processing ? <Loader2 size={14} className="spin" /> : <ArrowRight size={14} />}
                Interpret Command
              </button>
            )}
          </div>

          {/* Typed Fallback Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleProcessTranscript(typedInput);
            }}
            style={{ display: 'flex', gap: '8px' }}
          >
            <input
              type="text"
              className="input"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder="Or type command: 'Spent 500 on groceries with UPI'..."
              disabled={processing}
              style={{ flex: 1, fontSize: '12.5px' }}
            />
            <button
              type="submit"
              className="btn btn-secondary btn-sm"
              disabled={processing || !typedInput.trim()}
            >
              <Send size={14} />
              Run
            </button>
          </form>

          {/* Query Result (if question asked) */}
          {queryResponse && (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                backgroundColor: 'rgba(26, 24, 52, 0.85)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                color: '#F8FAFC',
                fontSize: '13px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
              }}
            >
              {queryResponse}
            </div>
          )}

          {/* Mandatory Transaction Confirmation Dialog */}
          {pendingTx && (
            <div
              style={{
                padding: '18px',
                borderRadius: '14px',
                backgroundColor: 'rgba(23, 21, 46, 0.95)',
                border: '1px solid rgba(34, 197, 94, 0.45)',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={18} style={{ color: '#22C55E' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#86EFAC' }}>
                  Confirm Extracted Transaction
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
                Please review and adjust details before saving to your ledger. FINORA will never commit a transaction without your explicit approval.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#94A3B8' }}>Title</label>
                  <input
                    type="text"
                    className="input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    style={{ fontSize: '12.5px', marginTop: '3px' }}
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
                    style={{ fontSize: '12.5px', marginTop: '3px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: '#94A3B8' }}>Type</label>
                  <select
                    className="input"
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as TransactionType)}
                    style={{ fontSize: '12.5px', marginTop: '3px' }}
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
                    style={{ fontSize: '12.5px', marginTop: '3px' }}
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
                    style={{ fontSize: '12.5px', marginTop: '3px' }}
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
                  Confirm & Save Transaction
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
