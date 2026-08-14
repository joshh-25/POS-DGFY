import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronsUpDown, Loader2, RefreshCw, Search, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fetchEmployeeCreditCheckoutOptions } from '../services/employeeCreditService.js';

const money = (value) => Number(value || 0).toFixed(2);

export default function EmployeeCreditPaymentPanel({
    selectedEmployee,
    onSelectEmployee,
    lookupLoading,
    account,
    totalDue,
    locationId = null
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [options, setOptions] = useState([]);
    const [optionsLoading, setOptionsLoading] = useState(true);
    const [optionsError, setOptionsError] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const requestSequence = useRef(0);

    useEffect(() => {
        const requestId = requestSequence.current + 1;
        requestSequence.current = requestId;
        const timer = window.setTimeout(async () => {
            setOptionsLoading(true);
            setOptionsError('');
            try {
                const rows = await fetchEmployeeCreditCheckoutOptions({ search, locationId, limit: 50 });
                if (requestSequence.current === requestId) {
                    setOptions(Array.isArray(rows) ? rows : []);
                }
            } catch (error) {
                if (requestSequence.current === requestId) {
                    setOptions([]);
                    setOptionsError(error?.response?.data?.message || 'Failed to load employees.');
                }
            } finally {
                if (requestSequence.current === requestId) {
                    setOptionsLoading(false);
                }
            }
        }, search ? 250 : 0);
        return () => window.clearTimeout(timer);
    }, [locationId, refreshKey, search]);

    const currentOutstanding = Number(
        account?.outstanding_balance
        ?? selectedEmployee?.outstanding_balance
        ?? selectedEmployee?.current_balance
        ?? 0
    );
    const outstandingAfterSale = currentOutstanding + Number(totalDue || 0);
    const isVerified = Boolean(account && selectedEmployee && selectedEmployee.is_eligible);
    const selectionStatus = useMemo(() => {
        if (!selectedEmployee) return null;
        if (lookupLoading) return { label: 'Validating employee credit…', tone: 'text-blue-700' };
        if (!selectedEmployee.account_configured) return { label: 'Employee Credit is not configured.', tone: 'text-amber-700' };
        if (!selectedEmployee.is_eligible) return { label: 'This employee is not eligible for Employee Credit.', tone: 'text-rose-700' };
        if (!account) return { label: 'Employee credit validation failed.', tone: 'text-rose-700' };
        return { label: 'Eligible. This sale will be added to the employee outstanding balance.', tone: 'text-emerald-700' };
    }, [account, lookupLoading, selectedEmployee]);

    return (
        <div className="space-y-3.5">
            <div className="space-y-3 rounded-xl border border-blue-100 bg-[#F8FAFC] p-3.5">
                <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-200/80 bg-blue-100/70 text-blue-700">
                        <UserRound className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-[13px] font-bold text-[#1A4E8D]">Employee Credit</p>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500 leading-snug">
                            Select an employee. Eligibility is validated automatically and the sale is recorded as an outstanding employee balance.
                        </p>
                    </div>
                </div>

                <div className="relative">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">Select Employee</p>
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                aria-expanded={open}
                                aria-label={selectedEmployee ? `Select Employee, ${selectedEmployee.employee_name}` : 'Select Employee'}
                                className="h-auto min-h-11 w-full justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm hover:bg-slate-50"
                            >
                                <span className="flex items-center gap-2.5 min-w-0">
                                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-[13px] font-extrabold text-slate-900">
                                            {selectedEmployee?.employee_name || 'Search and select employee'}
                                        </span>
                                        {selectedEmployee ? (
                                            <span className="block truncate text-[11px] font-semibold text-slate-500">
                                                {selectedEmployee.employee_code} · {selectedEmployee.branch_name}
                                            </span>
                                        ) : null}
                                    </span>
                                </span>
                                {lookupLoading
                                    ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin text-blue-600" />
                                    : <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] min-w-[280px] max-w-[calc(100vw-2rem)] p-0 z-50 shadow-xl border border-slate-200"
                            align="start"
                        >
                            <Command>
                                <CommandInput
                                    value={search}
                                    onValueChange={setSearch}
                                    placeholder="Search name or employee ID…"
                                    aria-label="Search employees"
                                />
                                <CommandList className="max-h-72">
                                    {optionsLoading ? (
                                        <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs font-semibold text-slate-500">
                                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> Loading employees…
                                        </div>
                                    ) : null}
                                    {!optionsLoading && optionsError ? (
                                        <div className="p-3 text-left space-y-2">
                                            <p className="text-xs font-bold text-rose-600">Failed to load Employee Credit checkout options</p>
                                            <div className="flex justify-end">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setRefreshKey((value) => value + 1)}
                                                    className="h-8 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                                >
                                                    <RefreshCw className="mr-1.5 h-3.5 w-3.5 text-blue-600" /> Retry
                                                </Button>
                                            </div>
                                        </div>
                                    ) : null}
                                    {!optionsLoading && !optionsError && options.length === 0 ? (
                                        <CommandEmpty>No matching employees found.</CommandEmpty>
                                    ) : null}
                                    {!optionsLoading && !optionsError ? (
                                        <CommandGroup>
                                            {options.map((option) => {
                                                const selected = selectedEmployee?.option_key === option.option_key;
                                                return (
                                                    <CommandItem
                                                        key={option.option_key}
                                                        selected={selected}
                                                        onSelect={() => {
                                                            onSelectEmployee(option);
                                                            setOpen(false);
                                                        }}
                                                        className="items-start gap-2"
                                                    >
                                                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'opacity-100 text-blue-700' : 'opacity-0'}`} />
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-center justify-between gap-2">
                                                                <span className="truncate font-extrabold text-slate-900">{option.employee_name}</span>
                                                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${option.is_eligible ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                                    {option.is_eligible ? 'Eligible' : 'Not eligible'}
                                                                </span>
                                                            </span>
                                                            <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">
                                                                {option.employee_code} · {option.branch_name}
                                                            </span>
                                                            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-bold text-slate-600">
                                                                <span>Outstanding: PHP {money(option.outstanding_balance ?? option.current_balance)}</span>
                                                                <span>Open tab</span>
                                                            </span>
                                                        </span>
                                                    </CommandItem>
                                                );
                                            })}
                                        </CommandGroup>
                                    ) : null}
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                {selectedEmployee ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-2 shadow-xs">
                        <div className="flex justify-between gap-3">
                            <span className="font-semibold text-slate-600">Employee</span>
                            <span className="text-right font-extrabold text-slate-900">{selectedEmployee.employee_name}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="font-semibold text-slate-600">Employee ID</span>
                            <span className="font-extrabold text-slate-900">{selectedEmployee.employee_code}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="font-semibold text-slate-600">Branch</span>
                            <span className="text-right font-extrabold text-slate-900">{selectedEmployee.branch_name}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="font-semibold text-slate-600">Current outstanding</span>
                            <span className="font-extrabold text-slate-900">PHP {money(currentOutstanding)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="font-semibold text-slate-600">Charge amount</span>
                            <span className="font-extrabold text-slate-900">PHP {money(totalDue)}</span>
                        </div>
                        {isVerified ? (
                            <div className="flex justify-between gap-3 border-t border-slate-100 pt-2">
                                <span className="font-semibold text-slate-600">Outstanding after sale</span>
                                <span className="font-extrabold text-slate-900">PHP {money(outstandingAfterSale)}</span>
                            </div>
                        ) : null}
                        {selectionStatus ? (
                            <p className={`border-t border-slate-100 pt-2 text-[11px] font-extrabold ${selectionStatus.tone}`}>
                                {selectionStatus.label}
                            </p>
                        ) : null}
                    </div>
                ) : null}

                <p className="text-[11px] font-medium text-slate-500">
                    Full Employee Credit payment only. The charge is excluded from cash drawer totals and remains recorded in the employee credit ledger.
                </p>
            </div>

            {optionsError ? (
                <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/95 p-3 text-rose-700 shadow-sm">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 mt-0.5">
                        <AlertCircle className="h-4.5 w-4.5" />
                    </div>
                    <div>
                        <p className="text-[13px] font-bold text-rose-700">Employee credit information is currently unavailable.</p>
                        <p className="mt-0.5 text-[11px] font-medium text-rose-600">Please try again or continue without employee credit.</p>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
