import { Mail, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export default function AffiliateInviteDialog({
    open,
    email,
    rate,
    inviting,
    onEmailChange,
    onRateChange,
    onSubmit,
    onClose
}) {
    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
            <DialogContent
                data-testid="affiliate-invite-dialog"
                className="affiliate-invite-dialog flex max-h-[calc(100vh-2rem)] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full"
            >
                <DialogHeader className="border-b border-slate-100 px-4 py-4 text-left sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-[#1b4e8d]">
                                <Mail className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                                <DialogTitle className="text-[16px] font-extrabold text-[#0F172A]">Invite Affiliate</DialogTitle>
                                <DialogDescription className="mt-0.5 text-[12px] leading-4 text-[#64748B]">
                                    Invite someone to promote your store by email.
                                </DialogDescription>
                            </div>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Close invite dialog"
                            onClick={onClose}
                            className="h-8 w-8 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                            <X aria-hidden="true" className="h-4 w-4" />
                        </Button>
                    </div>
                </DialogHeader>

                <form
                    className="min-h-0 flex flex-1 flex-col"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit();
                    }}
                >
                    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-5">
                        <div className="space-y-2">
                            <label htmlFor="affiliate-invite-email" className="text-[12px] font-black uppercase tracking-wide text-slate-600">
                                Email to invite <span className="text-rose-500">*</span>
                            </label>
                            <Input
                                id="affiliate-invite-email"
                                type="email"
                                aria-required="true"
                                autoFocus
                                placeholder="prospect@example.com"
                                value={email}
                                onChange={(event) => onEmailChange(event.target.value)}
                                className="h-10 rounded-lg border-slate-300 bg-white text-[14px] font-normal text-[#0F172A] placeholder:text-slate-400 focus:border-[#1b4e8d] focus-visible:ring-[#1b4e8d]/20"
                            />
                            <p className="text-[11px] leading-4 text-slate-400">An invitation code and onboarding link will be sent to this address.</p>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <label htmlFor="affiliate-invite-rate" className="text-[12px] font-black uppercase tracking-wide text-slate-600">Rate override</label>
                                <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">optional</span>
                            </div>
                            <div className="relative">
                                <Input
                                    id="affiliate-invite-rate"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    placeholder="Use program default"
                                    value={rate}
                                    onChange={(event) => onRateChange(event.target.value)}
                                    className="h-10 rounded-lg border-slate-300 bg-white pr-10 text-[14px] font-normal text-[#0F172A] placeholder:text-slate-400 focus:border-[#1b4e8d] focus-visible:ring-[#1b4e8d]/20"
                                />
                                <span aria-hidden="true" className="pointer-events-none absolute inset-y-2 right-3 flex items-center border-l border-slate-200 pl-2 text-xs font-bold text-slate-400">%</span>
                            </div>
                            <p className="text-[11px] leading-4 text-slate-400">Leave blank to use the storewide affiliate default rate (e.g. 5.00%). You can adjust or override rates individually later.</p>
                        </div>
                    </div>

                    <div className="affiliate-invite-dialog-footer flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-4 py-2.5 sm:px-5">
                        <Button
                            type="submit"
                            disabled={inviting}
                            className="h-10 min-w-0 w-full rounded-lg bg-[#1b4e8d] px-2 text-[11px] font-bold text-white hover:bg-[#143f73] focus-visible:ring-[#1b4e8d]"
                        >
                            <Send aria-hidden="true" className="mr-1.5 h-4 w-4" /> {inviting ? 'Sending...' : 'Send Invite'}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={inviting}
                            className="h-10 min-w-0 w-full rounded-lg border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
