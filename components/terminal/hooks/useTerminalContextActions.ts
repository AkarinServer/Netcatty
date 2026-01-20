import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback } from "react";
import type { RefObject } from "react";
import { logger } from "../../../lib/logger";
import { normalizeLineEndings } from "../../../lib/utils";

type TerminalBackendWriteApi = {
  writeToSession: (sessionId: string, data: string) => void;
};

export const useTerminalContextActions = ({
  termRef,
  sessionRef,
  terminalBackend,
  onHasSelectionChange,
}: {
  termRef: RefObject<XTerm | null>;
  sessionRef: RefObject<string | null>;
  terminalBackend: TerminalBackendWriteApi;
  onHasSelectionChange?: (hasSelection: boolean) => void;
}) => {
  const onCopy = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    const selection = term.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
  }, [termRef]);

  const onPaste = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text && sessionRef.current) terminalBackend.writeToSession(sessionRef.current, normalizeLineEndings(text));
    } catch (err) {
      logger.warn("Failed to paste from clipboard", err);
    }
  }, [sessionRef, termRef, terminalBackend]);

  const onSelectAll = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.selectAll();
    onHasSelectionChange?.(true);
  }, [onHasSelectionChange, termRef]);

  const onClear = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.clear();
  }, [termRef]);

  const onSelectWord = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.selectAll();
    onHasSelectionChange?.(true);
  }, [onHasSelectionChange, termRef]);

  return { onCopy, onPaste, onSelectAll, onClear, onSelectWord };
};
