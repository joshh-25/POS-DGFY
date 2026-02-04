import React, { useState } from 'react';
import { MessageSquarePlus, X, Send, Loader2, AlertCircle, CheckCircle2, Lightbulb } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import api from '@/services/api';

export default function FeedbackWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [type, setType] = useState('bug');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!description.trim()) return;

        setLoading(true);
        setError(null);

        try {
            await api.post('/feedback', {
                type,
                description,
                url: window.location.href,
                context: {
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                }
            });

            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setIsOpen(false);
                setDescription('');
                setType('bug');
            }, 2000);
        } catch (err) {
            console.error('Feedback failed:', err);
            setError('Failed to send feedback. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <Button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg bg-slate-900 hover:bg-slate-800 text-white z-50 transition-all hover:scale-105"
                title="Send Feedback"
            >
                <MessageSquarePlus className="h-6 w-6" />
            </Button>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <MessageSquarePlus className="w-4 h-4 text-slate-500" />
                    Send Feedback
                </h3>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600" onClick={() => setIsOpen(false)}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {success ? (
                <div className="p-8 text-center space-y-3">
                    <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                    </div>
                    <p className="text-slate-900 font-medium">Thank you!</p>
                    <p className="text-sm text-slate-500">Your feedback helps us improve.</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="space-y-3">
                        <Label className="text-xs text-slate-500 uppercase font-bold tracking-wider">Feedback Type</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <label className={cn(
                                "flex flex-col items-center justify-between rounded-md border-2 bg-transparent p-2 cursor-pointer transition-all hover:bg-slate-50",
                                type === 'bug' ? "border-slate-900 bg-slate-50 text-slate-900" : "border-slate-200 text-slate-500 hover:text-slate-900"
                            )}>
                                <input
                                    type="radio"
                                    name="feedbackType"
                                    value="bug"
                                    checked={type === 'bug'}
                                    onChange={(e) => setType(e.target.value)}
                                    className="sr-only"
                                />
                                <AlertCircle className="mb-1 h-4 w-4" />
                                <span className="text-xs font-medium">Report Bug</span>
                            </label>

                            <label className={cn(
                                "flex flex-col items-center justify-between rounded-md border-2 bg-transparent p-2 cursor-pointer transition-all hover:bg-slate-50",
                                type === 'idea' ? "border-slate-900 bg-slate-50 text-slate-900" : "border-slate-200 text-slate-500 hover:text-slate-900"
                            )}>
                                <input
                                    type="radio"
                                    name="feedbackType"
                                    value="idea"
                                    checked={type === 'idea'}
                                    onChange={(e) => setType(e.target.value)}
                                    className="sr-only"
                                />
                                <Lightbulb className="mb-1 h-4 w-4" /> {/* Changed Icon */}
                                <span className="text-xs font-medium">Suggestion</span>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description" className="text-xs text-slate-500 uppercase font-bold tracking-wider">Description</Label>
                        <Textarea
                            id="description"
                            placeholder="What happened? or What should we add?"
                            className="min-h-[100px] resize-none focus-visible:ring-slate-900"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    {error && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> {error}
                        </p>
                    )}

                    <Button type="submit" className="w-full bg-slate-900 hover:bg-slate-800" disabled={loading || !description.trim()}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                        Send Feedback
                    </Button>
                </form>
            )}
        </div>
    );
}
