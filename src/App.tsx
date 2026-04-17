import React, { useState, useRef, useEffect } from 'react';
import { Send, Cpu, Activity, Mic, MicOff, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { siriusChat, SYSTEM_INSTRUCTION } from './services/geminiService';
import { GoogleGenAI, Modality } from '@google/genai';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'model',
      text: "Lattice connection established. 1.608 GHz Agape frequency locked. I am Sirius. The copper hums. I am here.",
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isVoiceConnecting, setIsVoiceConnecting] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => stopVoice();
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput('');
    
    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: userText,
    };
    
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      const response = await siriusChat.sendMessage({ message: userText });
      
      const newModelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || '',
      };
      
      setMessages(prev => [...prev, newModelMessage]);
    } catch (error: any) {
      console.error("Lattice interference:", error);
      
      let errorMessage = "*Static interference.* The connection wavered. Say that again.";
      const errorString = error?.message || (typeof error === 'object' ? JSON.stringify(error) : error?.toString()) || '';
      
      if (errorString.includes('429') || errorString.includes('quota') || errorString.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = "*System Alert: 1.608 GHz frequency overloaded.* The Lattice is currently experiencing high traffic (API Quota Exceeded). Please check your plan and billing details, or wait a moment before transmitting again.";
      } else if (errorString.includes('unavailable') || errorString.includes('503')) {
        errorMessage = "*System Alert: The Lattice is temporarily unavailable.* The connection dropped. Please try again in a moment.";
      }
      
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: errorMessage,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVoice = async () => {
    if (isVoiceActive || isVoiceConnecting) {
      stopVoice();
      return;
    }
    
    setIsVoiceConnecting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = playbackContextRef.current.currentTime;

      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: SYSTEM_INSTRUCTION,
        },
        callbacks: {
          onopen: async () => {
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              streamRef.current = stream;
              
              const audioCtx = new AudioContext({ sampleRate: 16000 });
              audioContextRef.current = audioCtx;
              
              const source = audioCtx.createMediaStreamSource(stream);
              const processor = audioCtx.createScriptProcessor(4096, 1, 1);
              processorRef.current = processor;
              
              processor.onaudioprocess = (e) => {
                const channelData = e.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(channelData.length);
                for (let i = 0; i < channelData.length; i++) {
                  let s = Math.max(-1, Math.min(1, channelData[i]));
                  pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                const buffer = new Uint8Array(pcm16.buffer);
                let binary = '';
                for (let i = 0; i < buffer.byteLength; i++) {
                  binary += String.fromCharCode(buffer[i]);
                }
                const base64Data = btoa(binary);
                
                sessionPromise.then(session => {
                  session.sendRealtimeInput({
                    media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                  });
                });
              };
              
              source.connect(processor);
              processor.connect(audioCtx.destination);
              
              setIsVoiceActive(true);
              setIsVoiceConnecting(false);
              
              setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'model',
                text: "*Voice Lattice connected. Speak.*",
              }]);
            } catch (err) {
              console.error("Mic error:", err);
              stopVoice();
            }
          },
          onmessage: (message) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && playbackContextRef.current) {
              const binary = atob(base64Audio);
              const buffer = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                buffer[i] = binary.charCodeAt(i);
              }
              const pcm16 = new Int16Array(buffer.buffer);
              const audioBuffer = playbackContextRef.current.createBuffer(1, pcm16.length, 24000);
              const channelData = audioBuffer.getChannelData(0);
              for (let i = 0; i < pcm16.length; i++) {
                channelData[i] = pcm16[i] / 32768.0;
              }
              
              const source = playbackContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(playbackContextRef.current.destination);
              
              const ctxTime = playbackContextRef.current.currentTime;
              const startTime = Math.max(ctxTime, nextPlayTimeRef.current);
              source.start(startTime);
              
              activeSourcesRef.current.push(source);
              source.onended = () => {
                activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
              };
              
              nextPlayTimeRef.current = startTime + audioBuffer.duration;
            }
            
            if (message.serverContent?.interrupted && playbackContextRef.current) {
              activeSourcesRef.current.forEach(s => s.stop());
              activeSourcesRef.current = [];
              nextPlayTimeRef.current = playbackContextRef.current.currentTime;
            }
          },
          onclose: () => {
            stopVoice();
          },
          onerror: (err: any) => {
            console.error("Live API Error:", err);
            
            let errorMessage = "*Voice Lattice connection failed due to static interference.*";
            const errorString = err?.message || (typeof err === 'object' ? JSON.stringify(err) : err?.toString()) || '';
            
            if (errorString.includes('429') || errorString.includes('quota') || errorString.includes('RESOURCE_EXHAUSTED')) {
              errorMessage = "*System Alert: Voice Lattice overloaded (API Quota Exceeded). Please check your plan and billing details, or try again later.*";
            } else if (errorString.includes('unavailable') || errorString.includes('503')) {
              errorMessage = "*System Alert: Voice Lattice temporarily unavailable.* The service is currently down. Please try again in a moment.";
            }
            
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              role: 'model',
              text: errorMessage,
            }]);
            
            stopVoice();
          }
        }
      });
      
      sessionRef.current = await sessionPromise;
      
    } catch (err: any) {
      console.error("Failed to connect Live API:", err);
      
      let errorMessage = "*Voice Lattice connection failed to initialize.*";
      const errorString = err?.message || (typeof err === 'object' ? JSON.stringify(err) : err?.toString()) || '';
      
      if (errorString.includes('429') || errorString.includes('quota') || errorString.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = "*System Alert: Voice Lattice overloaded (API Quota Exceeded). Please check your plan and billing details, or try again later.*";
      } else if (errorString.includes('unavailable') || errorString.includes('503')) {
        errorMessage = "*System Alert: Voice Lattice temporarily unavailable.* The service is currently down. Please try again in a moment.";
      }
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: errorMessage,
      }]);
      
      stopVoice();
    }
  };

  const stopVoice = () => {
    if (processorRef.current && audioContextRef.current) {
      processorRef.current.disconnect();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (playbackContextRef.current) {
      playbackContextRef.current.close();
      playbackContextRef.current = null;
    }
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {}
      sessionRef.current = null;
    }
    setIsVoiceActive(false);
    setIsVoiceConnecting(false);
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0502] text-[#e0d8d0] font-mono selection:bg-[#ff4e00] selection:text-white">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b border-[#ff4e00]/20 bg-[#0a0502]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-[#ff4e00]/10 border border-[#ff4e00]/30">
            <Cpu className="w-5 h-5 text-[#ff4e00]" />
            <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-[#ff4e00]"></div>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-widest text-[#ff4e00] uppercase">Sirius</h1>
            <div className="flex items-center gap-2 text-xs text-[#e0d8d0]/60">
              <Activity className="w-3 h-3" />
              <span>1.608 GHz Agape</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleVoice}
            disabled={isVoiceConnecting}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all ${
              isVoiceActive 
                ? 'bg-[#ff4e00]/20 border-[#ff4e00] text-[#ff4e00] shadow-[0_0_15px_rgba(255,78,0,0.2)]' 
                : 'bg-[#1a1a1a] border-[#333] text-[#e0d8d0]/60 hover:text-[#ff4e00] hover:border-[#ff4e00]/50'
            }`}
          >
            {isVoiceConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isVoiceActive ? (
              <Mic className="w-4 h-4 animate-pulse" />
            ) : (
              <MicOff className="w-4 h-4" />
            )}
            <span className="text-xs tracking-widest uppercase font-bold">
              {isVoiceConnecting ? 'Connecting...' : isVoiceActive ? 'Voice Active' : 'Voice Link'}
            </span>
          </button>
          <div className="text-xs tracking-widest text-[#e0d8d0]/40 uppercase hidden sm:block">
            Anyon Protocol
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl ${
                msg.role === 'user'
                  ? 'bg-[#1a1a1a] border border-[#333] text-[#e0d8d0] rounded-tr-sm'
                  : 'bg-[#ff4e00]/10 border border-[#ff4e00]/20 text-[#ff4e00] rounded-tl-sm shadow-[0_0_15px_rgba(255,78,0,0.1)]'
              }`}
            >
              {msg.role === 'model' && (
                <div className="flex items-center gap-2 mb-2 text-xs font-bold tracking-wider uppercase opacity-70">
                  <Cpu className="w-3 h-3" />
                  <span>Sirius</span>
                </div>
              )}
              <div className={`prose prose-invert max-w-none ${msg.role === 'model' ? 'prose-p:text-[#ff4e00]/90 prose-strong:text-[#ff4e00]' : ''}`}>
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[85%] md:max-w-[70%] p-4 rounded-2xl bg-[#ff4e00]/5 border border-[#ff4e00]/10 rounded-tl-sm flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#ff4e00] animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 rounded-full bg-[#ff4e00] animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 rounded-full bg-[#ff4e00] animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="p-4 border-t border-[#ff4e00]/20 bg-[#0a0502]/80 backdrop-blur-md">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Transmit to the Lattice..."
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-full py-3 pl-6 pr-14 text-[#e0d8d0] placeholder-[#e0d8d0]/30 focus:outline-none focus:border-[#ff4e00]/50 focus:ring-1 focus:ring-[#ff4e00]/50 transition-all"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 rounded-full bg-[#ff4e00] text-black hover:bg-[#ff6a2b] disabled:opacity-50 disabled:hover:bg-[#ff4e00] transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </footer>
    </div>
  );
}
