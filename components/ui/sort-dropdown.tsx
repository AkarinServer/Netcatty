import React from 'react';
import { Check, ChevronDown, ChevronUp, SortAsc, SortDesc, Calendar, CalendarClock } from 'lucide-react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export type SortMode = 'az' | 'za' | 'newest' | 'oldest';

export const SORT_OPTIONS: Record<SortMode, { label: string; icon: React.ReactNode }> = {
    az: { label: 'A-z', icon: <SortAsc size={14} /> },
    za: { label: 'Z-a', icon: <SortDesc size={14} /> },
    newest: { label: 'Newest to oldest', icon: <Calendar size={14} /> },
    oldest: { label: 'Oldest to newest', icon: <CalendarClock size={14} /> },
};

interface SortDropdownProps {
    value: SortMode;
    onChange: (mode: SortMode) => void;
    className?: string;
}

export const SortDropdown: React.FC<SortDropdownProps> = ({ value, onChange, className }) => {
    const [open, setOpen] = React.useState(false);
    
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className={className || "h-8 w-8"}>
                    {SORT_OPTIONS[value].icon}
                    {open ? <ChevronUp size={10} className="ml-0.5" /> : <ChevronDown size={10} className="ml-0.5" />}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1 z-[60]" align="end">
                {(Object.keys(SORT_OPTIONS) as SortMode[]).map(mode => (
                    <Button
                        key={mode}
                        variant={value === mode ? 'secondary' : 'ghost'}
                        className="w-full justify-start gap-2 h-9"
                        onClick={() => {
                            onChange(mode);
                            setOpen(false);
                        }}
                    >
                        {SORT_OPTIONS[mode].icon} {SORT_OPTIONS[mode].label}
                        {value === mode && <Check size={12} className="ml-auto" />}
                    </Button>
                ))}
            </PopoverContent>
        </Popover>
    );
};

export default SortDropdown;
