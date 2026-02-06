import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, UserPlus } from 'lucide-react';
import { toast } from "sonner";
import * as userService from '../../src/services/userService.js';

export default function UserInvitationModal({ open, onOpenChange, onSuccess }) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('staff');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email) {
            toast.error('Please enter an email address');
            return;
        }

        setLoading(true);
        try {
            const result = await userService.inviteUser(email, role);

            if (result.email_sent) {
                toast.success(`Invitation sent to ${email}`);
            } else {
                toast.success(`Invitation created for ${email}`);
                // If email wasn't sent (e.g. no SMTP), maybe show the token?
                // For now, let's keep it simple. The list will show "Pending".
            }

            // Reset form
            setEmail('');
            setRole('staff');

            // Close modal
            onOpenChange(false);

            // Refresh parent list
            if (onSuccess) onSuccess();

        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to send invitation');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-teal-600" />
                        Invite New User
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="email">Email Address</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                id="email"
                                type="email"
                                placeholder="colleague@company.com"
                                className="pl-9"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="role">Role</Label>
                        <Select value={role} onValueChange={setRole}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="staff">Staff</SelectItem>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">
                            {role === 'admin' && "Full access to all settings and users."}
                            {role === 'manager' && "Can manage items, suppliers, and orders."}
                            {role === 'staff' && "Limited access to view and basic operations."}
                        </p>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-teal-600 hover:bg-teal-700" disabled={loading}>
                            {loading ? 'Sending...' : 'Send Invitation'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
