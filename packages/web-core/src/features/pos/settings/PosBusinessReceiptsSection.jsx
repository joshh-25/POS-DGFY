import { useState } from 'react';
import {
  AlertCircle, Award, Briefcase, ChevronDown, ChevronRight, FileText, MapPin, MessageSquare, ShieldCheck,
  Store, UserRound, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const POS_METADATA_FIELDS = [
  'registeredName', 'businessName', 'businessStyle', 'taxpayerType', 'tinBranch',
  'businessAddress', 'ptuNumber', 'minNumber', 'accreditationNumber', 'receiptFooterMessage',
  'fiscalBuyerDetailsRequired'
];

export default function PosBusinessReceiptsSection({
  locked, loading, posForm, setPosForm, showBusinessNameEditor = true
}) {
  const [isMetadataSetupOpen, setIsMetadataSetupOpen] = useState(false);
  const hasMetadata = POS_METADATA_FIELDS.some((field) => String(posForm?.[field] || '').trim());
  const showMetadataForm = loading || hasMetadata || isMetadataSetupOpen;

  return (
    <>
          <div className="border-b border-slate-200 pb-4 last:border-b-0 sm:pb-6">
            <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:pb-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[16px] font-extrabold text-[#0F172A]">Receipt &amp; POS Metadata</h3>
                  <p className="mt-1 text-[12px] font-medium leading-5 text-[#64748B]">
                    Shared business identity and fiscal receipt details used by POS and IMS.
                  </p>
                </div>
              </div>
            </div>
            {!showMetadataForm ? (
              <div className="mt-3 flex min-h-[18rem] items-center justify-center rounded-xl border border-blue-100 bg-white px-4 py-8 sm:mt-4 sm:min-h-[25rem] sm:px-8 sm:py-12">
                <div className="flex max-w-md flex-col items-center text-center">
                  <div className="relative mb-4 h-36 w-52 sm:mb-6" aria-hidden="true">
                    <div className="absolute inset-3 rounded-[2.5rem] bg-blue-50" />
                    <div className="absolute right-0 top-4 h-16 w-16 rounded-full bg-blue-100/80" />
                    <div className="absolute bottom-0 left-4 h-16 w-16 rounded-full bg-blue-100/70" />
                    <div className="absolute left-1/2 top-1/2 flex h-32 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-xl border border-blue-100 bg-white px-4 py-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-1 text-[#1A4E8D]">
                        <FileText className="h-4 w-4" />
                        <span className="text-[12px] font-extrabold tracking-tight">DGFY</span>
                      </div>
                      <div className="w-full space-y-2">
                        <span className="block h-1.5 rounded-full bg-slate-200" />
                        <span className="block h-1.5 w-4/5 rounded-full bg-slate-200" />
                        <span className="block h-1.5 w-3/5 rounded-full bg-slate-200" />
                      </div>
                      <Store className="mt-auto h-7 w-7 text-[#1A4E8D]" />
                    </div>
                  </div>
                  <h4 className="text-[20px] font-extrabold tracking-tight text-[#0F172A] sm:text-[24px]">Set up your business details</h4>
                  <p className="mt-2 text-[14px] font-medium text-[#5B6B86]">Used for receipts, invoices, and POS.</p>
                  <Button
                    type="button"
                    className="mt-4 min-h-10 w-full max-w-xs gap-2 rounded-xl bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white shadow-sm transition-colors hover:bg-[#143F73] sm:mt-6"
                    disabled={locked || loading}
                    onClick={() => setIsMetadataSetupOpen(true)}
                  >
                    <Store className="h-4 w-4" />
                    <span>Set Up Now</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
            <>
            <div className="mt-4 grid gap-3 sm:gap-4 md:grid-cols-2">
              {/* Row 1: Registered Name beside Business Name */}
              <div className={`grid gap-1.5 ${showBusinessNameEditor ? '' : 'md:col-span-2'}`}>
                <Label className="text-[12px] font-bold text-slate-700">Registered Name</Label>
                <div className="relative flex items-center">
                  <UserRound className="absolute left-3 h-4 w-4 text-[#1A4E8D]" />
                  <Input
                    className="h-9 pl-10 rounded-xl border-slate-200 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                    value={posForm.registeredName}
                    placeholder="e.g. Tinda Han Trading"
                    onChange={(event) => setPosForm((current) => ({ ...current, registeredName: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>
              {showBusinessNameEditor ? (
                <div className="grid gap-1.5">
                  <Label className="text-[12px] font-bold text-slate-700">Receipt business name</Label>
                  <div className="relative flex items-center">
                    <Store className="absolute left-3 h-4 w-4 text-[#1A4E8D]" />
                    <Input
                      className="h-9 pl-10 rounded-xl border-slate-200 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                      value={posForm.businessName}
                      placeholder="e.g. Tinda Han Store"
                      onChange={(event) => setPosForm((current) => ({ ...current, businessName: event.target.value }))}
                      disabled={locked || loading}
                    />
                  </div>
                  <p className="text-[11px] leading-4 text-slate-500">
                    Used on POS and IMS receipts. The canonical business identity is managed in OPIS Profile Setting.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-2.5 text-[11px] leading-4 text-[#1A4E8D] md:col-span-2">
                  The canonical business name is managed in Profile Setting. Receipt and fiscal fields below remain POS setup metadata.
                </div>
              )}

              {/* Row 2: Business Style beside Taxpayer Type */}
              <div className="grid gap-1.5">
                <Label className="text-[12px] font-bold text-slate-700">Business Style</Label>
                <div className="relative flex items-center">
                  <Briefcase className="absolute left-3 h-4 w-4 text-[#1A4E8D]" />
                  <Input
                    className="h-9 pl-10 rounded-xl border-slate-200 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                    value={posForm.businessStyle}
                    placeholder="e.g. Tinda Han"
                    onChange={(event) => setPosForm((current) => ({ ...current, businessStyle: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[12px] font-bold text-slate-700">Taxpayer Type</Label>
                <div className="relative flex items-center">
                  <Users className="absolute left-3 h-4 w-4 text-[#1A4E8D]" />
                  <Input
                    className="h-9 pl-10 pr-9 rounded-xl border-slate-200 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                    value={posForm.taxpayerType}
                    placeholder="Select taxpayer type"
                    onChange={(event) => setPosForm((current) => ({ ...current, taxpayerType: event.target.value }))}
                    disabled={locked || loading}
                  />
                  <ChevronDown className="absolute right-3 h-4 w-4 text-slate-400" />
                </div>
              </div>

              {/* Row 3: TIN / Branch beside Accreditation Number */}
              <div className="grid gap-1.5">
                <Label className="text-[12px] font-bold text-slate-700">TIN / Branch</Label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-sm font-bold text-[#1A4E8D] select-none">#</span>
                  <Input
                    className="h-9 pl-10 rounded-xl border-slate-200 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                    value={posForm.tinBranch}
                    placeholder="e.g. 123-456-789-000 / 000"
                    onChange={(event) => setPosForm((current) => ({ ...current, tinBranch: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[12px] font-bold text-slate-700">Accreditation Number</Label>
                <div className="relative flex items-center">
                  <Award className="absolute left-3 h-4 w-4 text-[#1A4E8D]" />
                  <Input
                    className="h-9 pl-10 rounded-xl border-slate-200 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                    value={posForm.accreditationNumber}
                    placeholder="Enter accreditation number"
                    onChange={(event) => setPosForm((current) => ({ ...current, accreditationNumber: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>

              {/* Row 4: Business Address full width */}
              <div className="grid gap-1.5 md:col-span-2">
                <Label className="text-[12px] font-bold text-slate-700">Business Address</Label>
                <div className="relative flex items-center">
                  <MapPin className="absolute left-3 h-4 w-4 text-[#1A4E8D]" />
                  <Input
                    className="h-9 pl-10 rounded-xl border-slate-200 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                    value={posForm.businessAddress}
                    placeholder="Enter complete business address"
                    onChange={(event) => setPosForm((current) => ({ ...current, businessAddress: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>

              {/* Row 5: PTU Number beside MIN Number */}
              <div className="grid gap-1.5">
                <Label className="text-[12px] font-bold text-slate-700">PTU Number</Label>
                <div className="relative flex items-center">
                  <FileText className="absolute left-3 h-4 w-4 text-[#1A4E8D]" />
                  <Input
                    className="h-9 pl-10 rounded-xl border-slate-200 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                    value={posForm.ptuNumber}
                    placeholder="Enter PTU number"
                    onChange={(event) => setPosForm((current) => ({ ...current, ptuNumber: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[12px] font-bold text-slate-700">MIN Number</Label>
                <div className="relative flex items-center">
                  <ShieldCheck className="absolute left-3 h-4 w-4 text-[#1A4E8D]" />
                  <Input
                    className="h-9 pl-10 rounded-xl border-slate-200 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                    value={posForm.minNumber}
                    placeholder="Enter machine identification number"
                    onChange={(event) => setPosForm((current) => ({ ...current, minNumber: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>

              {/* Row 6: Receipt footer message beside the fiscal invoice requirement */}
              <div className="grid gap-4 md:col-span-2 md:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] md:items-end">
                <div className="grid gap-1.5">
                  <Label className="text-[12px] font-bold text-slate-700">Receipt Footer Message</Label>
                  <div className="relative flex items-center">
                    <MessageSquare className="absolute left-3 h-4 w-4 text-[#1A4E8D]" />
                    <Input
                      className="h-9 pl-10 rounded-xl border-slate-200 text-[13px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
                      value={posForm.receiptFooterMessage}
                      placeholder="e.g. Thank you for shopping with us!"
                      onChange={(event) => setPosForm((current) => ({ ...current, receiptFooterMessage: event.target.value }))}
                      disabled={locked || loading}
                    />
                  </div>
                </div>

                <div className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/30 px-3 py-2.5 sm:min-h-11 sm:px-4 sm:py-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#1A4E8D]" aria-hidden="true" />
                    <div className="min-w-0">
                      <span className="block text-[12px] font-bold leading-4 text-slate-800">Require buyer fiscal details</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-slate-400 font-medium">
                        Required on fiscal invoices.
                      </span>
                    </div>
                  </div>
                  <Switch
                    aria-label="Require buyer fiscal details on fiscal invoices"
                    checked={posForm.fiscalBuyerDetailsRequired === true}
                    onCheckedChange={(enabled) => setPosForm((current) => ({ ...current, fiscalBuyerDetailsRequired: enabled === true }))}
                    disabled={locked || loading}
                    className={posForm.fiscalBuyerDetailsRequired === true ? 'bg-[#1A4E8D] focus-visible:ring-[#1A4E8D]' : 'bg-slate-200 focus-visible:ring-[#1A4E8D]'}
                  />
                </div>
              </div>
            </div>

            {!hasMetadata ? (
              <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-9 rounded-lg border-slate-200 px-4 text-[12px] font-bold text-[#1A4E8D] hover:bg-blue-50"
                  onClick={() => setIsMetadataSetupOpen(false)}
                  disabled={locked || loading}
                >
                  Cancel
                </Button>
              </div>
            ) : null}

            </>
            )}
          </div>

    </>
  );
}
