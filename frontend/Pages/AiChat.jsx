import React, { useState, useRef, useEffect } from 'react';
import {
    Send,
    Bot,
    User,
    Sparkles,
    MoreVertical,
    Search,
    Plus,
    MessageSquare,
    ChevronRight,
    Paperclip,
    Image as ImageIcon,
    Mic
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export default function AiChat() {
    const [messages, setMessages] = useState([
        {
            id: 1,
            role: 'assistant',
            content: "Hello! I'm your SKUpervisor AI assistant. I can help you analyze inventory trends, draft purchase orders, or answer questions about your suppliers. How can I assist you today?",
            timestamp: new Date().toISOString()
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = () => {
        if (!inputValue.trim()) return;

        const newUserMessage = {
            id: messages.length + 1,
            role: 'user',
            content: inputValue,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, newUserMessage]);
        setInputValue('');
        setIsTyping(true);

        // Mock AI response
        setTimeout(() => {
            const newAiMessage = {
                id: messages.length + 2,
                role: 'assistant',
                content: "I've received your request. As this is a demo, I can't process real data yet, but I'm ready to be connected to your backend services!",
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, newAiMessage]);
            setIsTyping(false);
        }, 1500);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const suggestedActions = [
        { label: "Check low stock items", icon: Search },
        { label: "Draft PO for Acme Corp", icon: Plus },
        { label: "Analyze monthly sales", icon: Sparkles },
    ];

    return (
        <div className="flex h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Sidebar - Chat History */}
            <div className="w-80 bg-slate-50 border-r border-slate-200 flex flex-col hidden md:flex">
                <div className="p-4 border-b border-slate-200">
                    <Button className="w-full justify-start gap-2 bg-teal-600 hover:bg-teal-700 text-white">
                        <Plus className="w-4 h-4" />
                        New Chat
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    <div className="text-xs font-semibold text-slate-500 px-3 py-2 uppercase tracking-wider">
                        Recent
                    </div>

                    {['Stock Analysis - Jan', 'Supplier Queries', 'Monthly Report Draft'].map((chat, i) => (
                        <button
                            key={i}
                            className={cn(
                                "w-full text-left px-3 py-3 rounded-xl text-base transition-colors flex items-center gap-3 font-medium",
                                i === 0 ? "bg-white shadow-sm border border-slate-200 text-slate-900" : "text-slate-600 hover:bg-slate-200/50"
                            )}
                        >
                            <MessageSquare className="w-5 h-5 text-slate-400" />
                            <span className="truncate flex-1">{chat}</span>
                            <ChevronRight className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100" />
                        </button>
                    ))}
                </div>

                <div className="p-4 border-t border-slate-200">
                    <div className="flex items-center gap-3 p-3 bg-teal-50 rounded-xl border border-teal-100">
                        <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-600">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-teal-900">Pro Features</p>
                            <p className="text-xs text-teal-600">Advanced analytics enabled</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-slate-50/50">
                {/* Chat Header */}
                <div className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-md shadow-teal-500/20">
                            <Bot className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">SKUpervisor Assistant</h2>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-sm font-medium text-slate-500">Always active</span>
                            </div>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600">
                        <MoreVertical className="w-5 h-5" />
                    </Button>
                </div>

                {/* Messages Stream */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={cn(
                                "flex w-full gap-4 max-w-3xl mx-auto",
                                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                            )}
                        >
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                msg.role === 'user' ? "bg-slate-200" : "bg-teal-100"
                            )}>
                                {msg.role === 'user' ? (
                                    <User className="w-5 h-5 text-slate-500" />
                                ) : (
                                    <Bot className="w-5 h-5 text-teal-600" />
                                )}
                            </div>

                            <div className={cn(
                                "flex flex-col gap-1 min-w-[120px]",
                                msg.role === 'user' ? "items-end" : "items-start"
                            )}>
                                <div className={cn(
                                    "px-5 py-4 rounded-2xl shadow-sm text-base leading-relaxed font-medium",
                                    msg.role === 'user'
                                        ? "bg-slate-900 text-white rounded-tr-none"
                                        : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                                )}>
                                    {msg.content}
                                </div>
                                <span className="text-xs text-slate-400 font-medium px-1">
                                    10:42 AM
                                </span>
                            </div>
                        </div>
                    ))}

                    {isTyping && (
                        <div className="flex w-full gap-4 max-w-3xl mx-auto">
                            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                                <Bot className="w-5 h-5 text-teal-600" />
                            </div>
                            <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white border-t border-slate-200">
                    <div className="max-w-3xl mx-auto space-y-4">
                        {messages.length === 1 && (
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                                {suggestedActions.map((action, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            setInputValue(action.label);
                                            // focus input
                                        }}
                                        className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-600 transition-colors whitespace-nowrap"
                                    >
                                        <action.icon className="w-4 h-4 text-teal-500" />
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="relative flex items-end gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500/20 transition-all">
                            <div className="flex items-center gap-1 pb-2 pl-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                                    <Paperclip className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                                    <ImageIcon className="w-4 h-4" />
                                </Button>
                            </div>

                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder="Ask me anything about your inventory..."
                                className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] py-2.5 text-base text-slate-900 placeholder:text-slate-500 font-medium"
                                rows={1}
                            />

                            <div className="pb-1 pr-1">
                                <Button
                                    onClick={handleSendMessage}
                                    disabled={!inputValue.trim() || isTyping}
                                    className={cn(
                                        "h-9 w-9 p-0 rounded-lg transition-all duration-200",
                                        inputValue.trim()
                                            ? "bg-teal-600 hover:bg-teal-700 text-white shadow-md shadow-teal-500/20"
                                            : "bg-slate-200 text-slate-400 hover:bg-slate-300"
                                    )}
                                >
                                    {inputValue.trim() ? (
                                        <Send className="w-4 h-4 ml-0.5" />
                                    ) : (
                                        <Mic className="w-4 h-4" />
                                    )}
                                </Button>
                            </div>
                        </div>

                        <p className="text-center text-[10px] text-slate-400">
                            AI can make mistakes. Please verify important inventory information.
                        </p>
                    </div>
                </div>
            </div>
        </div >
    );
}
