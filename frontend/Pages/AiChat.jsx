import React, { useState, useRef, useEffect, useCallback } from 'react';
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
    Mic,
    Trash2,
    AlertCircle,
    RefreshCw,
    Clock
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import * as aiService from '@/services/aiService';
import ConfirmActionDialog from '@/Components/ai/ConfirmActionDialog';
import ActionResultCard from '@/Components/ai/ActionResultCard';

export default function AiChat() {
    // State management
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [error, setError] = useState(null);
    const [pendingAction, setPendingAction] = useState(null);
    const [actionResult, setActionResult] = useState(null);
    const [isLoadingConversations, setIsLoadingConversations] = useState(true);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    // Initial welcome message
    const welcomeMessage = {
        id: 'welcome',
        role: 'assistant',
        content: "Hello! I'm your SKUpervisor AI assistant. I can help you manage inventory, create purchase orders, track job orders, and answer questions about your data. What would you like to do today?",
        timestamp: new Date().toISOString()
    };

    // Load conversations on mount
    useEffect(() => {
        loadConversations();
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const loadConversations = async () => {
        try {
            setIsLoadingConversations(true);
            const response = await aiService.getConversations();
            setConversations(response.data || []);
        } catch (err) {
            console.error('Failed to load conversations:', err);
        } finally {
            setIsLoadingConversations(false);
        }
    };

    const loadConversation = async (convId) => {
        try {
            setIsTyping(true);
            const response = await aiService.getConversation(convId);
            if (response.data) {
                setConversationId(convId);
                setSelectedConversation(convId);
                // Transform messages to our format
                const loadedMessages = response.data.messages.map((msg, idx) => ({
                    id: `loaded-${idx}`,
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp || new Date().toISOString()
                }));
                setMessages(loadedMessages);
            }
        } catch (err) {
            console.error('Failed to load conversation:', err);
            setError('Failed to load conversation');
        } finally {
            setIsTyping(false);
        }
    };

    const startNewChat = () => {
        setConversationId(null);
        setSelectedConversation(null);
        setMessages([welcomeMessage]);
        setError(null);
        setActionResult(null);
        setPendingAction(null);
        inputRef.current?.focus();
    };

    const deleteConversation = async (convId, e) => {
        e.stopPropagation();
        try {
            await aiService.deleteConversation(convId);
            setConversations(prev => prev.filter(c => c.conversation_id !== convId));
            if (selectedConversation === convId) {
                startNewChat();
            }
        } catch (err) {
            console.error('Failed to delete conversation:', err);
        }
    };

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isTyping) return;

        const userMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: inputValue,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsTyping(true);
        setError(null);
        setActionResult(null);

        try {
            const response = await aiService.sendMessage(inputValue, conversationId);

            // Update conversation ID if this is a new conversation
            if (response.data.conversationId && !conversationId) {
                setConversationId(response.data.conversationId);
                setSelectedConversation(response.data.conversationId);
                // Refresh conversation list
                loadConversations();
            }

            // Handle different response types
            if (response.data.requiresConfirmation) {
                // Store pending action for confirmation dialog
                setPendingAction({
                    actionId: response.data.actionId,
                    actionType: response.data.actionType,
                    description: response.data.description,
                    details: response.data.details,
                    expiresAt: response.data.expiresAt
                });

                // Add assistant message about the pending action
                const assistantMessage = {
                    id: `assistant-${Date.now()}`,
                    role: 'assistant',
                    content: response.data.message || `I'm ready to ${response.data.description}. Please confirm to proceed.`,
                    timestamp: new Date().toISOString(),
                    isPendingAction: true
                };
                setMessages(prev => [...prev, assistantMessage]);
            } else {
                // Regular response
                const assistantMessage = {
                    id: `assistant-${Date.now()}`,
                    role: 'assistant',
                    content: response.data.message,
                    timestamp: new Date().toISOString()
                };
                setMessages(prev => [...prev, assistantMessage]);
            }
        } catch (err) {
            console.error('AI chat error:', err);
            const errorMessage = err.response?.data?.error || 'Failed to get response from AI';
            setError(errorMessage);

            // Add error message to chat
            const errorAssistantMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: `I encountered an error: ${errorMessage}. Please try again.`,
                timestamp: new Date().toISOString(),
                isError: true
            };
            setMessages(prev => [...prev, errorAssistantMessage]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleConfirmAction = async () => {
        if (!pendingAction) return;

        setIsTyping(true);
        try {
            const response = await aiService.confirmAction(pendingAction.actionId);

            // Show result
            setActionResult({
                success: response.data.success,
                message: response.data.message,
                result: response.data.result
            });

            // Add confirmation result message
            const resultMessage = {
                id: `result-${Date.now()}`,
                role: 'assistant',
                content: response.data.message,
                timestamp: new Date().toISOString(),
                isResult: true,
                resultData: response.data.result
            };
            setMessages(prev => [...prev, resultMessage]);

        } catch (err) {
            console.error('Confirm action error:', err);
            setError(err.response?.data?.error || 'Failed to confirm action');
        } finally {
            setPendingAction(null);
            setIsTyping(false);
        }
    };

    const handleCancelAction = async () => {
        if (!pendingAction) return;

        try {
            await aiService.cancelAction(pendingAction.actionId);

            // Add cancellation message
            const cancelMessage = {
                id: `cancel-${Date.now()}`,
                role: 'assistant',
                content: 'Action cancelled. How else can I help you?',
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, cancelMessage]);

        } catch (err) {
            console.error('Cancel action error:', err);
        } finally {
            setPendingAction(null);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatConversationDate = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    };

    const suggestedActions = [
        { label: "Check low stock items", icon: Search },
        { label: "Show dashboard stats", icon: Sparkles },
        { label: "List recent purchase orders", icon: Plus },
    ];

    // Initialize with welcome message
    useEffect(() => {
        if (messages.length === 0) {
            setMessages([welcomeMessage]);
        }
    }, []);

    return (
        <div className="flex h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Sidebar - Chat History */}
            <div className="w-80 bg-slate-50 border-r border-slate-200 flex flex-col hidden md:flex">
                <div className="p-4 border-b border-slate-200">
                    <Button
                        onClick={startNewChat}
                        className="w-full justify-start gap-2 bg-teal-600 hover:bg-teal-700 text-white"
                    >
                        <Plus className="w-4 h-4" />
                        New Chat
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    <div className="text-xs font-semibold text-slate-500 px-3 py-2 uppercase tracking-wider">
                        Recent Conversations
                    </div>

                    {isLoadingConversations ? (
                        <div className="flex items-center justify-center py-8">
                            <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
                        </div>
                    ) : conversations.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-sm">
                            No conversations yet
                        </div>
                    ) : (
                        conversations.map((conv) => (
                            <div
                                key={conv.conversation_id}
                                onClick={() => loadConversation(conv.conversation_id)}
                                className={cn(
                                    "group w-full text-left px-3 py-3 rounded-xl text-base transition-colors flex items-center gap-3 font-medium cursor-pointer",
                                    selectedConversation === conv.conversation_id
                                        ? "bg-white shadow-sm border border-slate-200 text-slate-900"
                                        : "text-slate-600 hover:bg-slate-200/50"
                                )}
                            >
                                <MessageSquare className="w-5 h-5 text-slate-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <span className="truncate block">{conv.title || 'Untitled Chat'}</span>
                                    <span className="text-xs text-slate-400">
                                        {formatConversationDate(conv.updated_at)}
                                    </span>
                                </div>
                                <button
                                    onClick={(e) => deleteConversation(conv.conversation_id, e)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                                >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-slate-200">
                    <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                            <Clock className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-amber-900">30-Day Retention</p>
                            <p className="text-xs text-amber-600">Chats auto-delete after 30 days</p>
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
                                <span className={cn(
                                    "w-2.5 h-2.5 rounded-full",
                                    isTyping ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                                )} />
                                <span className="text-sm font-medium text-slate-500">
                                    {isTyping ? 'Thinking...' : 'Ready to help'}
                                </span>
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
                                msg.role === 'user' ? "bg-slate-200" : msg.isError ? "bg-red-100" : "bg-teal-100"
                            )}>
                                {msg.role === 'user' ? (
                                    <User className="w-5 h-5 text-slate-500" />
                                ) : msg.isError ? (
                                    <AlertCircle className="w-5 h-5 text-red-600" />
                                ) : (
                                    <Bot className="w-5 h-5 text-teal-600" />
                                )}
                            </div>

                            <div className={cn(
                                "flex flex-col gap-1 min-w-[120px] max-w-[80%]",
                                msg.role === 'user' ? "items-end" : "items-start"
                            )}>
                                <div className={cn(
                                    "px-5 py-4 rounded-2xl shadow-sm text-base leading-relaxed",
                                    msg.role === 'user'
                                        ? "bg-slate-900 text-white rounded-tr-none"
                                        : msg.isError
                                            ? "bg-red-50 border border-red-200 text-red-800 rounded-tl-none"
                                            : msg.isPendingAction
                                                ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-tl-none"
                                                : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                                )}>
                                    <div className="whitespace-pre-wrap">{msg.content}</div>

                                    {/* Show action result card if this message has result data */}
                                    {msg.isResult && msg.resultData && (
                                        <div className="mt-3">
                                            <ActionResultCard result={msg.resultData} />
                                        </div>
                                    )}
                                </div>
                                <span className="text-xs text-slate-400 font-medium px-1">
                                    {formatTimestamp(msg.timestamp)}
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
                        {messages.length <= 1 && (
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                                {suggestedActions.map((action, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            setInputValue(action.label);
                                            inputRef.current?.focus();
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
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder="Ask me anything about your inventory..."
                                className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] py-2.5 text-base text-slate-900 placeholder:text-slate-500 font-medium"
                                rows={1}
                                disabled={isTyping}
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

            {/* Confirmation Dialog */}
            {pendingAction && (
                <ConfirmActionDialog
                    isOpen={!!pendingAction}
                    onClose={() => setPendingAction(null)}
                    onConfirm={handleConfirmAction}
                    onCancel={handleCancelAction}
                    action={pendingAction}
                    isLoading={isTyping}
                />
            )}
        </div>
    );
}
