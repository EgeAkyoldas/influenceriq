'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Trash2, Sparkles, Bot, User, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Panel (compact) → Fullscreen transition animation variants
const panelVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, damping: 28, stiffness: 320, mass: 0.8 },
  },
  exit: {
    opacity: 0, y: 24, scale: 0.94,
    transition: { duration: 0.18, ease: 'easeIn' as const },
  },
};

const fullscreenVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: {
    opacity: 1, scale: 1,
    transition: { type: 'spring' as const, damping: 30, stiffness: 280, mass: 0.9 },
  },
  exit: {
    opacity: 0, scale: 0.97,
    transition: { duration: 0.15, ease: 'easeIn' as const },
  },
};

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};

export function AIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) inputRef.current.focus();
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
        else if (isOpen) setIsOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isFullscreen]);

  // Lock body scroll when fullscreen is open
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsStreaming(true);

    try {
      const chatHistory = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader');

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') last.content += parsed.text;
                  return updated;
                });
              }
            } catch { /* skip malformed chunks */ }
          }
        }
      }
    } catch (error) {
      console.error('[Chat] Error:', error);
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          last.content = '⚠️ Something went wrong. Please try again.';
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => setMessages([]);

  const closeAll = () => {
    setIsFullscreen(false);
    setIsOpen(false);
  };

  const toggleFullscreen = () => setIsFullscreen(prev => !prev);

  // ── Shared chat content ──────────────────────────────────────────────────
  const chatContent = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
          >
            <Bot size={16} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">IQ Assistant</h3>
            <span className="text-[10px] text-zinc-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
              Gemini 2.5 Flash
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearChat}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300"
            title="Clear chat"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300"
            title={isFullscreen ? 'Minimize' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={closeAll}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-4 scroll-smooth"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg, #7c3aed20, #a855f720)' }}
            >
              <Sparkles size={28} className="text-violet-400" />
            </div>
            <h4 className="text-base font-medium text-zinc-300 mb-1">IQ Assistant</h4>
            <p className="text-sm text-zinc-500 mb-6 max-w-sm">
              Ask about lead data, AI analyses, pipeline status, and platform insights.
            </p>
            <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
              {[
                'How many leads are there and what are their statuses?',
                'Who are the top candidates?',
                'Summarize the tier distribution',
                'What sources do we have and how many leads from each?',
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => setInput(q)}
                  className="text-left text-sm px-4 py-2.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 hover:border-violet-500/30 text-zinc-400 hover:text-zinc-200 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'linear-gradient(135deg, #7c3aed40, #a855f740)' }}
              >
                <Bot size={12} className="text-violet-400" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-violet-600/20 border border-violet-500/20 text-zinc-200'
                  : 'bg-zinc-800/60 border border-zinc-700/30 text-zinc-300'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="prose prose-invert prose-sm max-w-none
                  prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
                  prose-headings:my-2 prose-headings:text-zinc-200
                  prose-strong:text-violet-300 prose-code:text-emerald-400
                  prose-code:bg-zinc-900 prose-code:px-1 prose-code:rounded
                  prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700">
                  <ReactMarkdown>{msg.content || '▍'}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-zinc-800 border border-zinc-700">
                <User size={12} className="text-zinc-400" />
              </div>
            )}
          </div>
        ))}

        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-zinc-500 pl-8">
            <Loader2 size={12} className="animate-spin text-violet-400" />
            <span>thinking...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 shrink-0">
        <div className="flex items-end gap-2 bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-3 py-2 focus-within:border-violet-500/40 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 resize-none outline-none max-h-[120px]"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="p-1.5 rounded-lg transition-all disabled:opacity-30 enabled:hover:bg-violet-600/20 enabled:text-violet-400 text-zinc-600"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)',
              boxShadow: '0 0 30px rgba(124, 58, 237, 0.4), 0 8px 32px rgba(0, 0, 0, 0.3)',
            }}
          >
            <Sparkles size={24} className="text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Fullscreen Modal ── */}
      <AnimatePresence>
        {isOpen && isFullscreen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={closeAll}
              className="fixed inset-0 z-60"
              style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            />

            {/* Fullscreen Panel */}
            <motion.div
              key="fullscreen-panel"
              variants={fullscreenVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed inset-4 sm:inset-6 md:inset-10 lg:inset-16 z-70 flex flex-col rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(9, 9, 11, 0.96)',
                backdropFilter: 'blur(32px)',
                border: '1px solid rgba(124, 58, 237, 0.25)',
                boxShadow: '0 0 80px rgba(124, 58, 237, 0.2), 0 32px 64px rgba(0, 0, 0, 0.6)',
              }}
            >
              {chatContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Compact Panel ── */}
      <AnimatePresence>
        {isOpen && !isFullscreen && (
          <motion.div
            key="panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl overflow-hidden
              w-[calc(100vw-2rem)] sm:w-[420px] h-[80vh] sm:h-[600px] max-h-[700px]"
            style={{
              background: 'rgba(9, 9, 11, 0.92)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(124, 58, 237, 0.2)',
              boxShadow: '0 0 60px rgba(124, 58, 237, 0.15), 0 24px 48px rgba(0, 0, 0, 0.4)',
            }}
          >
            {chatContent}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
