import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { HotkeyScheme, KeyBinding } from "../../../domain/models";
import { keyEventToString } from "../../../domain/models";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { SectionHeader, Select, SettingsTabContent, SettingRow } from "../settings-ui";

export default function SettingsShortcutsTab(props: {
  hotkeyScheme: HotkeyScheme;
  setHotkeyScheme: (scheme: HotkeyScheme) => void;
  keyBindings: KeyBinding[];
  updateKeyBinding?: (bindingId: string, scheme: "mac" | "pc", newKey: string) => void;
  resetKeyBinding?: (bindingId: string, scheme?: "mac" | "pc") => void;
  resetAllKeyBindings: () => void;
}) {
  const { hotkeyScheme, setHotkeyScheme, keyBindings, updateKeyBinding, resetKeyBinding, resetAllKeyBindings } = props;

  const [recordingBindingId, setRecordingBindingId] = useState<string | null>(null);
  const [recordingScheme, setRecordingScheme] = useState<"mac" | "pc" | null>(null);

  const cancelRecording = useCallback(() => {
    setRecordingBindingId(null);
    setRecordingScheme(null);
  }, []);

  const getSpecialSuffix = useCallback(
    (bindingId: string): string | null => {
      const binding = keyBindings.find((b) => b.id === bindingId);
      if (!binding) return null;
      const currentKey = hotkeyScheme === "mac" ? binding.mac : binding.pc;
      if (currentKey.includes("[1...9]")) return "[1...9]";
      if (currentKey.includes("arrows")) return "arrows";
      return null;
    },
    [keyBindings, hotkeyScheme],
  );

  useEffect(() => {
    if (!recordingBindingId || !recordingScheme) return;

    const specialSuffix = getSpecialSuffix(recordingBindingId);

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        cancelRecording();
        return;
      }

      if (specialSuffix) {
        if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return;

        const parts: string[] = [];
        if (recordingScheme === "mac") {
          if (e.metaKey) parts.push("⌘");
          if (e.ctrlKey) parts.push("⌃");
          if (e.altKey) parts.push("⌥");
          if (e.shiftKey) parts.push("Shift");
        } else {
          if (e.ctrlKey) parts.push("Ctrl");
          if (e.altKey) parts.push("Alt");
          if (e.shiftKey) parts.push("Shift");
          if (e.metaKey) parts.push("Win");
        }

        const modifierString = parts.length > 0 ? `${parts.join(" + ")} + ` : "";
        const fullKeyString = modifierString + specialSuffix;

        updateKeyBinding?.(recordingBindingId, recordingScheme, fullKeyString);
        cancelRecording();
        return;
      }

      if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return;
      const keyString = keyEventToString(e, recordingScheme === "mac");
      updateKeyBinding?.(recordingBindingId, recordingScheme, keyString);
      cancelRecording();
    };

    const handleClick = () => {
      cancelRecording();
    };

    const timer = setTimeout(() => {
      window.addEventListener("click", handleClick, true);
    }, 100);

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("click", handleClick, true);
    };
  }, [recordingBindingId, recordingScheme, updateKeyBinding, cancelRecording, getSpecialSuffix]);

  const categories = useMemo(() => ["tabs", "terminal", "navigation", "app"] as const, []);

  return (
    <SettingsTabContent value="shortcuts">
      <SectionHeader title="Hotkey Scheme" />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label="Keyboard shortcuts"
          description="Choose which keyboard layout to use for shortcuts"
        >
          <Select
            value={hotkeyScheme}
            options={[
              { value: "disabled", label: "Disabled" },
              { value: "mac", label: "Mac (⌘)" },
              { value: "pc", label: "PC (Ctrl)" },
            ]}
            onChange={(v) => setHotkeyScheme(v as HotkeyScheme)}
            className="w-32"
          />
        </SettingRow>
      </div>

      {hotkeyScheme !== "disabled" && (
        <>
          <div className="flex items-center justify-between">
            <SectionHeader title="Custom Shortcuts" className="mb-0" />
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAllKeyBindings}
              className="text-xs gap-1"
            >
              <RotateCcw size={12} /> Reset All
            </Button>
          </div>

          {categories.map((category) => {
            const categoryBindings = keyBindings.filter((kb) => kb.category === category);
            if (categoryBindings.length === 0) return null;
            return (
              <div key={category}>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {category}
                </h4>
                <div className="space-y-0 divide-y divide-border rounded-lg border bg-card">
                  {categoryBindings.map((binding) => {
                    const currentKey = hotkeyScheme === "mac" ? binding.mac : binding.pc;
                    const specialSuffix = currentKey.includes("[1...9]")
                      ? "[1...9]"
                      : currentKey.includes("arrows")
                        ? "arrows"
                        : null;
                    const isSpecialBinding = !!specialSuffix;

                    const modifierPrefix = isSpecialBinding
                      ? currentKey.replace(specialSuffix!, "").trim().replace(/\+\s*$/, "").trim()
                      : null;

                    const isRecordingThis = recordingBindingId === binding.id;
                    const scheme = hotkeyScheme === "mac" ? "mac" : "pc";

                    return (
                      <div key={binding.id} className="flex items-center justify-between px-4 py-2">
                        <span className="text-sm">{binding.label}</span>
                        <div className="flex items-center gap-2">
                          {isSpecialBinding ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRecordingBindingId(binding.id);
                                  setRecordingScheme(scheme);
                                }}
                                className={cn(
                                  "px-2 py-1 text-xs font-mono rounded border transition-colors min-w-[60px] text-center",
                                  isRecordingThis
                                    ? "border-primary bg-primary/10 animate-pulse"
                                    : "border-border hover:border-primary/50",
                                )}
                              >
                                {isRecordingThis ? "Press Keys..." : modifierPrefix || "None"}
                              </button>
                              <span className="text-xs text-muted-foreground">+</span>
                              <span className="px-2 py-1 text-xs font-mono rounded border border-border bg-muted/30 text-muted-foreground">
                                {specialSuffix}
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRecordingBindingId(binding.id);
                                setRecordingScheme(scheme);
                              }}
                              className={cn(
                                "px-2 py-1 text-xs font-mono rounded border transition-colors min-w-[80px] text-center",
                                isRecordingThis
                                  ? "border-primary bg-primary/10 animate-pulse"
                                  : "border-border hover:border-primary/50",
                              )}
                            >
                              {isRecordingThis ? "Press Keys..." : currentKey || "Disabled"}
                            </button>
                          )}
                          <button
                            onClick={() => resetKeyBinding?.(binding.id, scheme)}
                            className="p-1 hover:bg-muted rounded"
                            title="Reset to default"
                          >
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </SettingsTabContent>
  );
}

