import React from "react";
import { cn } from "../../lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { TabsContent } from "../ui/tabs";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      checked ? "bg-primary" : "bg-input",
    )}
  >
    <span
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
        checked ? "translate-x-4" : "translate-x-0",
      )}
    />
  </button>
);

interface SelectProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({ value, options, onChange, className, disabled }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    className={cn(
      "h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
  >
    {options.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);

export const SectionHeader: React.FC<{ title: string; className?: string }> = ({
  title,
  className,
}) => <h3 className={cn("text-sm font-semibold text-foreground mb-3", className)}>{title}</h3>;

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

export const SettingRow: React.FC<SettingRowProps> = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-3 gap-4">
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium">{label}</div>
      {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

export const SettingsTabContent: React.FC<{
  value: string;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <TabsContent value={value} className="flex-1 m-0 h-full overflow-hidden">
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">{children}</div>
    </ScrollArea>
  </TabsContent>
);

