import { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Trash2,
  Cpu,
} from 'lucide-react';
import { financeService } from '../services/financeService';
import type { CopilotChatMessage, CopilotChatResponse } from '../types';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isGenerative?: boolean;
  modelUsed?: string;
  timestamp: string;
}

const DEFAULT_PROMPTS = [
  'What is my current net balance?',
  'Where did I spend the most this month?',
  'Check my budget limits and overruns',
  'How are my savings goals progressing?',
  'Predict my month-end expenses',
];

export function CopilotDrawer({ isOpen, onClose }: CopilotDrawerProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hello! I am your FINORA AI Financial Copilot.\n\nI answer your questions using your genuine transaction records, active budgets, and savings milestones. I will never fabricate numbers or hallucinate transactions.\n\nHow can I help you today?',
      isGenerative: false,
      modelUsed: 'FINORA Intelligence',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(DEFAULT_PROMPTS);
  const [lastModelUsed, setLastModelUsed] = useState<string | null>(null);
  const [lastIsGenerative, setLastIsGenerative] = useState<boolean | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idCounterRef = useRef<number>(1);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputValue).trim();
    if (!query || loading) return;

    idCounterRef.current += 1;
    const currentId = idCounterRef.current;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMsg: DisplayMessage = {
      id: `u-${currentId}`,
      role: 'user',
      content: query,
      timestamp: timeStr,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setLoading(true);

    // Build chat history for context
    const apiHistory: CopilotChatMessage[] = messages
      .filter((m) => m.id !== 'welcome')
      .slice(-6)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    try {
      const resp: CopilotChatResponse = await financeService.sendCopilotChat(query, apiHistory);
      idCounterRef.current += 1;
      const assistantMsg: DisplayMessage = {
        id: `a-${idCounterRef.current}`,
        role: 'assistant',
        content: resp.reply,
        isGenerative: resp.is_generative,
        modelUsed: resp.model_used,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setLastModelUsed(resp.model_used);
      setLastIsGenerative(resp.is_generative);
      if (resp.suggested_prompts && resp.suggested_prompts.length > 0) {
        setSuggestedPrompts(resp.suggested_prompts);
      }
    } catch {
      idCounterRef.current += 1;
      const errorMsg: DisplayMessage = {
        id: `err-${idCounterRef.current}`,
        role: 'assistant',
        content:
          'Sorry, I encountered an issue analyzing your financial ledger. Please verify that the backend server is reachable and retry.',
        isGenerative: false,
        modelUsed: 'System Error',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistory = () => {
    idCounterRef.current += 1;
    setMessages([
      {
        id: `reset-${idCounterRef.current}`,
        role: 'assistant',
        content: 'Conversation history reset. Ask me anything about your finances!',
        isGenerative: false,
        modelUsed: 'FINORA Intelligence',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setSuggestedPrompts(DEFAULT_PROMPTS);
    setLastModelUsed(null);
    setLastIsGenerative(null);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(5, 5, 12, 0.65)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          height: '100%',
          backgroundColor: '#0F0E1E',
          borderLeft: '1px solid rgba(139, 92, 246, 0.3)',
          boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.75)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
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
            backgroundColor: 'rgba(23, 21, 46, 0.7)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.35)',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC' }}>
                FINORA AI Copilot
              </div>
              <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                Ledger-Grounded Financial Advisor
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="icon-btn"
              onClick={handleClearHistory}
              title="Clear chat history"
              style={{ color: '#94A3B8' }}
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              title="Close Copilot"
              style={{ color: '#94A3B8' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Engine Source Badge */}
        <div
          style={{
            padding: '7px 18px',
            backgroundColor:
              lastIsGenerative === true
                ? 'rgba(34, 197, 94, 0.12)'
                : 'rgba(139, 92, 246, 0.12)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11.5px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {lastIsGenerative === true ? (
              <>
                <Sparkles size={13} style={{ color: '#22C55E' }} />
                <span style={{ color: '#86EFAC', fontWeight: 600 }}>
                  Active: Gemini 2.0 Flash
                </span>
              </>
            ) : (
              <>
                <Cpu size={13} style={{ color: '#A78BFA' }} />
                <span style={{ color: '#DDD6FE', fontWeight: 600 }}>
                  {lastModelUsed || 'FINORA Deterministic Rule Engine'}
                </span>
              </>
            )}
          </div>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#94A3B8',
            }}
          >
            Zero Hallucination Guarantee
          </span>
        </div>

        {/* Message Thread */}
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
          {messages.map((msg) => {
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
                      width: '26px',
                      height: '26px',
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
                    {isUser ? <User size={13} /> : <Bot size={14} />}
                  </div>

                  <div
                    style={{
                      padding: '11px 14px',
                      borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      backgroundColor: isUser
                        ? '#7C3AED'
                        : 'rgba(26, 24, 52, 0.85)',
                      border: isUser
                        ? '1px solid #8B5CF6'
                        : '1px solid rgba(139, 92, 246, 0.22)',
                      color: '#F8FAFC',
                      fontSize: '13px',
                      lineHeight: '1.55',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: '10px',
                    color: '#64748B',
                    marginTop: '3px',
                    padding: isUser ? '0 34px 0 0' : '0 0 0 34px',
                  }}
                >
                  {msg.modelUsed ? `${msg.modelUsed} • ` : ''}
                  {msg.timestamp}
                </div>
              </div>
            );
          })}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(139, 92, 246, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#A78BFA',
                }}
              >
                <Bot size={14} />
              </div>
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '4px 14px 14px 14px',
                  backgroundColor: 'rgba(26, 24, 52, 0.85)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  color: '#94A3B8',
                  fontSize: '12.5px',
                  fontStyle: 'italic',
                }}
              >
                Analyzing your financial records...
              </div>
            </div>
          )}
        </div>

        {/* Suggested Prompts Pills */}
        {suggestedPrompts.length > 0 && !loading && (
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              backgroundColor: 'rgba(15, 14, 30, 0.85)',
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {suggestedPrompts.slice(0, 4).map((p, idx) => (
              <button
                key={idx}
                type="button"
                style={{
                  padding: '5px 10px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(139, 92, 246, 0.15)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  color: '#DDD6FE',
                  fontSize: '11px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
                onClick={() => void handleSendMessage(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendMessage();
          }}
          style={{
            padding: '14px 18px',
            borderTop: '1px solid rgba(139, 92, 246, 0.25)',
            backgroundColor: 'rgba(23, 21, 46, 0.9)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about spending, budgets, savings..."
            disabled={loading}
            style={{
              flex: 1,
              backgroundColor: '#121124',
              borderColor: 'rgba(139, 92, 246, 0.35)',
              fontSize: '13px',
            }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !inputValue.trim()}
            style={{ padding: '9px 14px' }}
          >
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}
