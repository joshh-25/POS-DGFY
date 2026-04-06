import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
    Lock,
    LogOut,
    MessageSquare,
    Building2,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    AlertCircle,
    DollarSign
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import * as adminService from '@/services/adminService';

const SIDEBAR_ITEMS = [
    { path: '/admin/feedback', label: 'Feedback', icon: MessageSquare },
    { path: '/admin/tenants', label: 'Tenants', icon: Building2 },
    { path: '/admin/pricing', label: 'Plan Pricing', icon: DollarSign },
];

export default function AdminLayout() {
    const navigate = useNavigate();
    const location = useLocation();

    // Authentication state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loggingIn, setLoggingIn] = useState(false);
    const [sessionExpired, setSessionExpired] = useState(false);

    // Sidebar state
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Check authentication on mount and register auth failure callback
    useEffect(() => {
        if (adminService.isAuthenticated()) {
            setIsAuthenticated(true);
        }

        // Register callback for authentication failures
        adminService.setAuthFailureCallback(() => {
            setIsAuthenticated(false);
            setSessionExpired(true);
        });
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        setLoggingIn(true);
        setSessionExpired(false); // Clear the session expired message

        try {
            await adminService.login(username, password);
            setIsAuthenticated(true);
            // Redirect to tenants if on base /admin
            if (location.pathname === '/admin') {
                navigate('/admin/tenants');
            }
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
                            <h1 className="text-2xl font-bold text-white">Admin Portal</h1>
                            <p className="text-slate-300 text-sm mt-1">Master Admin Access</p>
                        </div>

                        {/* Login Form */}
                        <form onSubmit={handleLogin} className="p-6 space-y-4">
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 text-sm">
                                Temporary admin credentials are in use for this phase and all login attempts are monitored.
                            </div>

                            {sessionExpired && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-amber-800 text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    Your session has expired. Please login again.
                                </div>
                            )}

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

    // Admin Portal Layout
    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <aside className={cn(
                "bg-slate-900 text-white transition-all duration-300 flex flex-col",
                sidebarCollapsed ? "w-16" : "w-64"
            )}>
                {/* Logo */}
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                    {!sidebarCollapsed && (
                        <h1 className="text-lg font-bold">Admin Portal</h1>
                    )}
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        {sidebarCollapsed ? (
                            <ChevronRight className="w-5 h-5" />
                        ) : (
                            <ChevronLeft className="w-5 h-5" />
                        )}
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-2 space-y-1">
                    {SIDEBAR_ITEMS.map(item => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left",
                                    isActive
                                        ? "bg-slate-700 text-white"
                                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                                )}
                            >
                                <Icon className="w-5 h-5 shrink-0" />
                                {!sidebarCollapsed && <span>{item.label}</span>}
                            </button>
                        );
                    })}
                </nav>

                {/* Logout */}
                <div className="p-2 border-t border-slate-700">
                    <button
                        onClick={handleLogout}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-slate-300 hover:bg-slate-800 hover:text-white",
                            sidebarCollapsed && "justify-center"
                        )}
                    >
                        <LogOut className="w-5 h-5 shrink-0" />
                        {!sidebarCollapsed && <span>Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-6 overflow-auto">
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Admin access is on temporary credential mode during hardening. Avoid sharing credentials and report unexpected login activity immediately.
                </div>
                <Outlet />
            </main>
        </div>
    );
}
