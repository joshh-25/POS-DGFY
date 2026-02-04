import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Lock,
    LogOut,
    RefreshCw,
    Search,
    Filter,
    AlertCircle,
    Lightbulb,
    Calendar,
    User,
    Globe,
    Clock,
    X,
    Building2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import * as adminService from '@/services/adminService';

export default function FeedbackViewer() {
    const navigate = useNavigate();

    // Authentication state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loggingIn, setLoggingIn] = useState(false);

    // Feedback state
    const [feedback, setFeedback] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Filter state
    const [filters, setFilters] = useState({
        type: 'all',
        search: '',
        startDate: '',
        endDate: ''
    });
    const [showFilters, setShowFilters] = useState(false);

    // Check authentication on mount
    useEffect(() => {
        if (adminService.isAuthenticated()) {
            setIsAuthenticated(true);
            loadFeedback();
            loadStats();
        }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        setLoggingIn(true);

        try {
            await adminService.login(username, password);
            setIsAuthenticated(true);
            loadFeedback();
            loadStats();
        } catch (err) {
            setLoginError(err.response?.data?.message || 'Invalid credentials');
        } finally {
            setLoggingIn(false);
        }
    };

    const handleLogout = () => {
        adminService.logout();
        setIsAuthenticated(false);
        setUsername('');
        setPassword('');
        setFeedback([]);
        setStats(null);
    };

    const loadFeedback = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await adminService.getFeedback(filters);
            setFeedback(response.data || []);
        } catch (err) {
            if (err.response?.status === 401 || err.response?.status === 403) {
                // Session expired
                handleLogout();
            } else {
                setError('Failed to load feedback');
            }
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            const response = await adminService.getStats();
            setStats(response.data);
        } catch (err) {
            console.error('Failed to load stats:', err);
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const applyFilters = () => {
        loadFeedback();
        setShowFilters(false);
    };

    const clearFilters = () => {
        setFilters({
            type: 'all',
            search: '',
            startDate: '',
            endDate: ''
        });
        setTimeout(() => loadFeedback(), 100);
    };

    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleString();
    };

    const getTypeIcon = (type) => {
        return type === 'bug' ? AlertCircle : Lightbulb;
    };

    const getTypeColor = (type) => {
        return type === 'bug' ? 'text-red-600 bg-red-50' : 'text-blue-600 bg-blue-50';
    };

    // Login Form
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-center">
                            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Lock className="w-8 h-8 text-white" />
                            </div>
                            <h1 className="text-2xl font-bold text-white">Admin Access</h1>
                            <p className="text-slate-300 text-sm mt-1">Feedback Viewer</p>
                        </div>

                        {/* Login Form */}
                        <form onSubmit={handleLogin} className="p-6 space-y-4">
                            {loginError && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2 text-red-800 text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {loginError}
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="username">Username</Label>
                                <Input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Enter admin username"
                                    required
                                    disabled={loggingIn}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter password"
                                    required
                                    disabled={loggingIn}
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-slate-900 hover:bg-slate-800"
                                disabled={loggingIn}
                            >
                                {loggingIn ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                        Authenticating...
                                    </>
                                ) : (
                                    <>
                                        <Lock className="w-4 h-4 mr-2" />
                                        Login
                                    </>
                                )}
                            </Button>
                        </form>
                    </div>

                    <div className="mt-4 text-center">
                        <button
                            onClick={() => navigate('/')}
                            className="text-slate-600 hover:text-slate-900 text-sm underline"
                        >
                            ← Back to Home
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Admin Dashboard
    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">Feedback Dashboard</h1>
                            <p className="text-slate-500 text-sm mt-1">Developer portal for user feedback</p>
                        </div>
                        <Button
                            onClick={handleLogout}
                            variant="outline"
                            className="gap-2"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </Button>
                    </div>

                    {/* Stats */}
                    {stats && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                            <div className="bg-slate-50 rounded-lg p-4">
                                <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
                                <div className="text-sm text-slate-600">Total Feedback</div>
                            </div>
                            <div className="bg-red-50 rounded-lg p-4">
                                <div className="text-2xl font-bold text-red-600">{stats.bugs}</div>
                                <div className="text-sm text-red-700">Bug Reports</div>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-4">
                                <div className="text-2xl font-bold text-blue-600">{stats.ideas}</div>
                                <div className="text-sm text-blue-700">Suggestions</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            onClick={loadFeedback}
                            variant="outline"
                            size="sm"
                            disabled={loading}
                        >
                            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
                            Refresh
                        </Button>

                        <Button
                            onClick={() => setShowFilters(!showFilters)}
                            variant="outline"
                            size="sm"
                        >
                            <Filter className="w-4 h-4 mr-2" />
                            Filters
                        </Button>

                        {(filters.type !== 'all' || filters.search || filters.startDate || filters.endDate) && (
                            <Button
                                onClick={clearFilters}
                                variant="ghost"
                                size="sm"
                            >
                                <X className="w-4 h-4 mr-2" />
                                Clear Filters
                            </Button>
                        )}

                        <div className="ml-auto text-sm text-slate-600">
                            {feedback.length} {feedback.length === 1 ? 'entry' : 'entries'}
                        </div>
                    </div>

                    {/* Filter Panel */}
                    {showFilters && (
                        <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <Label className="text-xs mb-2">Type</Label>
                                <select
                                    value={filters.type}
                                    onChange={(e) => handleFilterChange('type', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                >
                                    <option value="all">All Types</option>
                                    <option value="bug">Bug Reports</option>
                                    <option value="idea">Suggestions</option>
                                </select>
                            </div>

                            <div>
                                <Label className="text-xs mb-2">Search</Label>
                                <Input
                                    placeholder="Search description..."
                                    value={filters.search}
                                    onChange={(e) => handleFilterChange('search', e.target.value)}
                                    className="text-sm"
                                />
                            </div>

                            <div>
                                <Label className="text-xs mb-2">Start Date</Label>
                                <Input
                                    type="date"
                                    value={filters.startDate}
                                    onChange={(e) => handleFilterChange('startDate', e.target.value)}
                                    className="text-sm"
                                />
                            </div>

                            <div>
                                <Label className="text-xs mb-2">End Date</Label>
                                <Input
                                    type="date"
                                    value={filters.endDate}
                                    onChange={(e) => handleFilterChange('endDate', e.target.value)}
                                    className="text-sm"
                                />
                            </div>

                            <div className="md:col-span-4">
                                <Button onClick={applyFilters} size="sm" className="w-full md:w-auto">
                                    Apply Filters
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2 text-red-800">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        {error}
                    </div>
                )}

                {/* Feedback List */}
                <div className="space-y-4">
                    {loading ? (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                            <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-3" />
                            <p className="text-slate-600">Loading feedback...</p>
                        </div>
                    ) : feedback.length === 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                            <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-600 text-lg font-medium">No feedback yet</p>
                            <p className="text-slate-500 text-sm">Feedback submissions will appear here</p>
                        </div>
                    ) : (
                        feedback.map((item) => {
                            const TypeIcon = getTypeIcon(item.type);
                            return (
                                <div
                                    key={item.id}
                                    className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className={cn(
                                            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                                            getTypeColor(item.type)
                                        )}>
                                            <TypeIcon className="w-5 h-5" />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-4 mb-3">
                                                <div>
                                                    <span className={cn(
                                                        "inline-block px-2 py-1 rounded text-xs font-medium",
                                                        getTypeColor(item.type)
                                                    )}>
                                                        {item.type === 'bug' ? 'Bug Report' : 'Suggestion'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                                                    <Clock className="w-4 h-4" />
                                                    {formatDate(item.timestamp)}
                                                </div>
                                            </div>

                                            <p className="text-slate-900 text-base leading-relaxed mb-4 whitespace-pre-wrap">
                                                {item.description}
                                            </p>

                                            <div className="flex flex-wrap gap-4 text-sm">
                                                {item.url && item.url !== 'N/A' && (
                                                    <div className="flex items-center gap-1.5 text-slate-600">
                                                        <Globe className="w-4 h-4" />
                                                        <span className="truncate max-w-xs">{item.url}</span>
                                                    </div>
                                                )}
                                                {(item.user || item.user_id) && (
                                                    <div className="flex flex-wrap gap-2 items-center text-slate-600 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                                                        <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200">
                                                            <User className="w-4 h-4 text-slate-400" />
                                                            <span className="font-semibold text-slate-900">
                                                                {item.user?.username || 'User ID: ' + (item.user?.id || item.user_id)}
                                                            </span>
                                                        </div>
                                                        {item.user?.email && item.user.email !== 'N/A' && (
                                                            <div className="text-slate-600 font-medium">
                                                                {item.user.email}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {item.tenant && (
                                                    <div className="flex items-center gap-1.5 text-slate-600 bg-indigo-50 px-3 py-2 rounded-lg border border-indigo-100">
                                                        <Building2 className="w-4 h-4 text-indigo-500" />
                                                        <span className="font-semibold text-indigo-900">
                                                            {item.tenant.name || 'Tenant ID: ' + item.tenant.id}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {item.context?.userAgent && (
                                                <div className="mt-3 pt-3 border-t border-slate-100">
                                                    <p className="text-xs text-slate-500 font-mono">
                                                        {item.context.userAgent}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
