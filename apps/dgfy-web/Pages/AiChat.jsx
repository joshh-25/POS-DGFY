import React, { Suspense, lazy, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Send,
    Bot,
    User,
    Sparkles,
    MoreVertical,
    Search,
    Plus,
    MessageSquare,
    Paperclip,
    Image as ImageIcon,
    Mic,
    Trash2,
    AlertCircle,
    RefreshCw,
    Clock,
    X,
    FileText,
    Upload,
    Lock,
    ShieldAlert
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import * as aiService from '@/services/aiService';
import ConfirmActionDialog from '@/components/ai/ConfirmActionDialog';
import ActionResultCard from '@/components/ai/ActionResultCard';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import { usePermission } from '@/hooks/usePermission';
import { toast } from 'sonner';
import { subscriptionsEnabled } from '../src/utils/subscriptionUi.js';

const MarkdownRenderer = lazy(() => import('@/components/ai/MarkdownRenderer'));
const AiDiagnosticsPanel = lazy(() => import('@/components/ai/AiDiagnosticsPanel'));

const buildWelcomeMessage = () => ({
    id: 'welcome',
    role: 'assistant',
    content: "Hello! I'm your SKUpervisor AI assistant. I can help you manage inventory, create purchase orders, track job orders, and answer questions about your data. What would you like to do today?",
    timestamp: new Date().toISOString()
});

export default function AiChat() {
    const navigate = useNavigate();
    const subscriptionFeaturesEnabled = subscriptionsEnabled();
    const { can, tenantPlan, loading } = usePermission();

    // State management
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [conversationId, setConversationId] = useState(null);
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [, setError] = useState(null);
    const [pendingAction, setPendingAction] = useState(null);
    const [, setActionResult] = useState(null);
    const [isLoadingConversations, setIsLoadingConversations] = useState(true);
    const [conversationToDelete, setConversationToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [showDiagnostics, setShowDiagnostics] = useState(false);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const imageInputRef = useRef(null);
    const dragCounter = useRef(0);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    const getRateLimitMessage = useCallback((err, fallbackMessage) => {
        const retryAfterSeconds = err?.response?.data?.retryAfterSeconds;
        if (retryAfterSeconds) {
            return `${fallbackMessage} Please retry in about ${retryAfterSeconds} seconds.`;
        }
        return fallbackMessage;
    }, []);

    const loadConversations = useCallback(async ({ showErrorToast = false } = {}) => {
        try {
            setIsLoadingConversations(true);
            const response = await aiService.getConversations();
            setConversations(response.data?.conversations || []);
        } catch (err) {
            console.error('Failed to load conversations:', err);
            if (showErrorToast) {
                const isRateLimited = err?.response?.status === 429;
                const message = isRateLimited
                    ? getRateLimitMessage(err, 'Recent conversations are temporarily rate-limited.')
                    : 'Failed to refresh recent conversations.';
                toast.error(message);
            }
        } finally {
            setIsLoadingConversations(false);
        }
    }, [getRateLimitMessage]);

    // Load conversations when permission checks pass
    useEffect(() => {
        if (!loading && tenantPlan === 'premium') {
            loadConversations();
        }
    }, [loading, tenantPlan, loadConversations]);

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Auto-focus input when AI finishes typing or chat is opened
    useEffect(() => {
        if (!isTyping) {
            // Small timeout ensures the disabled attribute is removed from the DOM first
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [isTyping]);

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
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    };

    const startNewChat = () => {
        setConversationId(null);
        setSelectedConversation(null);
        setMessages([buildWelcomeMessage()]);
        setError(null);
        setActionResult(null);
        setPendingAction(null);
        inputRef.current?.focus();
    };

    const deleteConversation = (convId, e) => {
        e.stopPropagation();
        setConversationToDelete(convId);
    };

    const handleConfirmDelete = async () => {
        if (!conversationToDelete) return;

        try {
            setIsDeleting(true);
            await aiService.deleteConversation(conversationToDelete);
            setConversations(prev => prev.filter(c => c.id !== conversationToDelete));
            if (selectedConversation === conversationToDelete) {
                startNewChat();
            }
            setConversationToDelete(null);
        } catch (err) {
            console.error('Failed to delete conversation:', err);
            // Optionally set an error state here if you want to show it in the dialog
        } finally {
            setIsDeleting(false);
        }
    };

    // File Handling
    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const newFiles = Array.from(e.dataTransfer.files);
            addFiles(newFiles);
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            addFiles(newFiles);
        }
        // Reset input value to allow selecting the same file again
        e.target.value = '';
    };

    const addFiles = (newFiles) => {
        // Filter logical max size or type here if needed
        // For now, valid types are handled by backend, frontend just restricts images button

        // Prevent duplicates by name+size check? 
        // For simplicity, just add them. Limit is 5 total.
        setAttachments(prev => {
            const combined = [...prev, ...newFiles];
            if (combined.length > 5) {
                setError("You can only upload up to 5 files at a time.");
                return combined.slice(0, 5);
            }
            return combined;
        });
    };

    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleActionClick = (action) => {
        if (typeof action === 'string') {
            navigate(action);
        } else if (action?.type === 'suggestion') {
            setInputValue(action.prompt);
            // Optional: Auto-submit? For now let user confirm.
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    };

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isTyping) return;

        // Build file metadata for display in chat bubble
        const fileMetadata = attachments.length > 0
            ? attachments.map(file => ({
                name: file.name,
                type: file.type,
                size: file.size,
                preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
            }))
            : undefined;

        const userMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: inputValue,
            timestamp: new Date().toISOString(),
            attachments: fileMetadata
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsTyping(true);
        setError(null);
        setActionResult(null);

        try {
            const response = await aiService.sendMessage(inputValue, conversationId, attachments);
            setAttachments([]); // Clear attachments after sending

            // Update conversation ID if this is a new conversation
            if (response.data?.conversationId && !conversationId) {
                setConversationId(response.data.conversationId);
                setSelectedConversation(response.data.conversationId);
            }

            // Handle different response types
            if (response.data?.type === 'confirmation_required') {
                // Store pending action for confirmation dialog
                // Use snake_case to match what ConfirmActionDialog expects
                setPendingAction({
                    action_id: response.data.action_id,
                    action_type: response.data.action_type,
                    description: response.data.description,
                    details: response.data.details,
                    expires_in: response.data.expires_in || 300
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
                    content: response.data.content || response.data.message, // Fallback to message just in case
                    timestamp: new Date().toISOString()
                };
                setMessages(prev => [...prev, assistantMessage]);
            }

            // Always refresh recent conversations after successful chat response.
            // This keeps sidebar state in sync even for existing conversations.
            loadConversations({ showErrorToast: true });
        } catch (err) {
            console.error('AI chat error:', err);
            const isRateLimited = err?.response?.status === 429;
            const errorMessage = isRateLimited
                ? getRateLimitMessage(err, 'Too many requests to AI right now.')
                : (err.response?.data?.message || err.response?.data?.error || 'Failed to get response from AI');
            setError(errorMessage);
            if (isRateLimited) {
                toast.error(errorMessage);
            }

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
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    };


    const handleConfirmAction = async () => {
        if (!pendingAction) return;

        // Permission check
        if (!can('ai:action')) {
            toast.error("You don't have permission to execute AI actions.");
            return;
        }

        setIsTyping(true);
        try {
            const response = await aiService.confirmAction(pendingAction.action_id);

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
                resultData: response.data.data?.result
            };
            setMessages(prev => [...prev, resultMessage]);

        } catch (err) {
            console.error('Confirm action error:', err);
            setError(err.response?.data?.message || 'Failed to confirm action');
        } finally {
            setPendingAction(null);
            setIsTyping(false);
        }
    };

    const handleCancelAction = async () => {
        if (!pendingAction) return;

        try {
            await aiService.cancelAction(pendingAction.action_id);

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
        setMessages((prev) => (prev.length === 0 ? [buildWelcomeMessage()] : prev));
    }, []);

    // Auto-resize textarea height
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
        }
    }, [inputValue]);

    return (
        <div
            className="flex h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
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
                                key={conv.id || conv.conversation_id}
                                onClick={() => loadConversation(conv.id || conv.conversation_id)}
                                className={cn(
                                    "group w-full text-left px-3 py-3 rounded-xl text-base transition-colors flex items-center gap-3 font-medium cursor-pointer",
                                    selectedConversation === conv.id
                                        ? "bg-white shadow-sm border border-slate-200 text-slate-900"
                                        : "text-slate-600 hover:bg-slate-200/50"
                                )}
                            >
                                <MessageSquare className="w-5 h-5 text-slate-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <span className="truncate block">{conv.title || 'Untitled Chat'}</span>
                                    <span className="text-xs text-slate-400">
                                        {formatConversationDate(conv.last_message_at || conv.created_at)}
                                    </span>
                                </div>
                                <button
                                    onClick={(e) => deleteConversation(conv.id, e)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                                >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 border-t border-slate-200 space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                            <Clock className="w-4 h-4" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-amber-900">30-Day Retention</p>
                            <p className="text-xs text-amber-600">Chats auto-delete after 30 days</p>
                        </div>
                    </div>
                    {can('ai:chat') && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start gap-2 text-slate-500 hover:text-teal-600 hover:bg-teal-50"
                            onClick={() => setShowDiagnostics(true)}
                        >
                            <ShieldAlert className="w-4 h-4" />
                            AI Capability Checker
                        </Button>
                    )}
                </div>
            </div>

            {/* Diagnostics Modal */}
            <Dialog open={showDiagnostics} onOpenChange={setShowDiagnostics}>
                <DialogContent className="max-w-2xl p-0 overflow-hidden bg-slate-50">
                    {showDiagnostics && (
                        <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading diagnostics...</div>}>
                            <AiDiagnosticsPanel onClose={() => setShowDiagnostics(false)} />
                        </Suspense>
                    )}
                </DialogContent>
            </Dialog>

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
                                    {msg.role === 'user' ? (
                                        <div>
                                            {/* Render file attachments from current session */}
                                            {msg.attachments && msg.attachments.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-2">
                                                    {msg.attachments.map((file, idx) => (
                                                        <div key={idx} className="rounded-lg overflow-hidden">
                                                            {file.preview ? (
                                                                <img src={file.preview} alt={file.name}
                                                                    className="max-w-[200px] max-h-[200px] rounded-lg object-cover" />
                                                            ) : (
                                                                <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
                                                                    <FileText className="w-4 h-4 text-slate-300" />
                                                                    <span className="text-sm text-slate-300 truncate max-w-[150px]">{file.name}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {/* Render images from stored conversation history (base64 in content array) */}
                                            {!msg.attachments && Array.isArray(msg.content) && (
                                                <div className="flex flex-wrap gap-2 mb-2">
                                                    {msg.content.filter(part => part.type === 'image_url').map((part, idx) => (
                                                        <img key={idx} src={part.image_url?.url} alt={`Attachment ${idx + 1}`}
                                                            className="max-w-[200px] max-h-[200px] rounded-lg object-cover" />
                                                    ))}
                                                </div>
                                            )}
                                            {/* Render text content */}
                                            <div className="whitespace-pre-wrap">
                                                {Array.isArray(msg.content)
                                                    ? msg.content.find(part => part.type === 'text')?.text || ''
                                                    : msg.content}
                                            </div>
                                        </div>
                                    ) : (
                                        <Suspense fallback={<div className="whitespace-pre-wrap">{msg.content}</div>}>
                                            <MarkdownRenderer content={msg.content} />
                                        </Suspense>
                                    )}

                                    {/* Show action result card if this message has result data */}
                                    {msg.isResult && msg.resultData && (
                                        <div className="mt-3">
                                            <ActionResultCard
                                                result={msg.resultData}
                                                onViewDetails={handleActionClick}
                                            />
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

                        {/* File Preview Area */}
                        {attachments.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                                {attachments.map((file, index) => (
                                    <div key={index} className="relative group shrink-0">
                                        <div className="w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1 overflow-hidden p-1">
                                            {file.type.startsWith('image/') ? (
                                                <img
                                                    src={URL.createObjectURL(file)}
                                                    alt={file.name}
                                                    className="w-full h-full object-cover rounded-md"
                                                />
                                            ) : (
                                                <>
                                                    <FileText className="w-8 h-8 text-slate-400" />
                                                    <span className="text-[10px] text-slate-500 text-center w-full truncate px-1">
                                                        {file.name}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => removeAttachment(index)}
                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="relative flex items-end gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500/20 transition-all">
                            <div className="flex items-center gap-1 pb-2 pl-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-400 hover:text-slate-600"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Paperclip className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-400 hover:text-slate-600"
                                    onClick={() => imageInputRef.current?.click()}
                                >
                                    <ImageIcon className="w-4 h-4" />
                                </Button>
                            </div>

                            <textarea
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder="Ask me anything about your inventory..."
                                className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] py-2.5 px-4 text-base text-slate-900 placeholder:text-slate-500 font-medium disabled:cursor-not-allowed disabled:bg-slate-100 rounded-lg"
                                rows={1}
                            />

                            <div className="pb-1 pr-1">
                                <Button
                                    onClick={handleSendMessage}
                                    disabled={(!inputValue.trim() && attachments.length === 0) || isTyping}
                                    className={cn(
                                        "h-9 w-9 p-0 rounded-lg transition-all duration-200",
                                        (inputValue.trim() || attachments.length > 0)
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
                    open={!!pendingAction}
                    onClose={() => setPendingAction(null)}
                    onConfirm={handleConfirmAction}
                    onCancel={handleCancelAction}
                    action={pendingAction}
                    isLoading={isTyping}
                />
            )}

            {/* Delete Confirmation Dialog */}
            <DeleteConfirmDialog
                open={!!conversationToDelete}
                onClose={() => setConversationToDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Delete Conversation"
                description="Are you sure you want to delete this conversation? This action cannot be undone."
                confirmText="Delete"
                loading={isDeleting}
            />
            {/* Hidden File Inputs */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                onChange={handleFileSelect}
            />
            <input
                type="file"
                ref={imageInputRef}
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
            />

            {/* Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 bg-teal-500/10 backdrop-blur-[2px] z-50 flex items-center justify-center border-2 border-dashed border-teal-500 rounded-2xl pointer-events-none">
                    <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-200">
                        <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center">
                            <Upload className="w-8 h-8 text-teal-600" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-slate-900">Drop files here</h3>
                            <p className="text-slate-500">to add them to the chat</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Premium Lock Overlay */}
            {tenantPlan !== 'premium' && (
                <div className="absolute inset-0 z-[60] backdrop-blur-sm bg-white/60 flex items-center justify-center">
                    <div className="max-w-md w-full mx-auto p-8 bg-white rounded-2xl shadow-2xl border border-slate-200 text-center space-y-6">
                        <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20 transform rotate-3">
                            <Lock className="w-10 h-10 text-white" />
                        </div>

                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold text-slate-900">Premium Feature</h2>
                            <p className="text-slate-600">
                                The AI Assistant is available exclusively for Premium plan subscribers. Upgrade your workspace to unlock intelligent inventory management.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <Button
                                onClick={() => navigate('/settings?tab=subscription')}
                                disabled={!subscriptionFeaturesEnabled}
                                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/20 h-11 text-base font-medium"
                            >
                                {subscriptionFeaturesEnabled ? 'Upgrade to Premium' : 'Upgrades temporarily disabled'}
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => navigate('/dashboard')}
                                className="text-slate-500 hover:text-slate-700"
                            >
                                Return to Dashboard
                            </Button>
                        </div>

                        <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs text-slate-500 text-left">
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Smart Insights
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Automated Actions
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                24/7 Availability
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Data Privacy
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
