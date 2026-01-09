/**
 * TextEditorModal - Modal for editing text files in SFTP with syntax highlighting
 */
import {
  CloudUpload,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import Editor, { type OnMount, loader } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Configure Monaco to use local files instead of CDN
const monacoBasePath = import.meta.env.DEV
  ? './node_modules/monaco-editor/min/vs'
  : `${import.meta.env.BASE_URL}monaco/vs`;
loader.config({ paths: { vs: monacoBasePath } });

import { useI18n } from '../application/i18n/I18nProvider';
import { getLanguageId, getLanguageName, getSupportedLanguages } from '../lib/sftpFileUtils';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Combobox } from './ui/combobox';
import { toast } from './ui/toast';

interface TextEditorModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
}

// Map our language IDs to Monaco language IDs
const languageIdToMonaco = (langId: string): string => {
  const mapping: Record<string, string> = {
    'javascript': 'javascript',
    'typescript': 'typescript',
    'python': 'python',
    'shell': 'shell',
    'batch': 'bat',
    'powershell': 'powershell',
    'c': 'c',
    'cpp': 'cpp',
    'java': 'java',
    'kotlin': 'kotlin',
    'go': 'go',
    'rust': 'rust',
    'ruby': 'ruby',
    'php': 'php',
    'perl': 'perl',
    'lua': 'lua',
    'r': 'r',
    'swift': 'swift',
    'dart': 'dart',
    'csharp': 'csharp',
    'fsharp': 'fsharp',
    'vb': 'vb',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'json': 'json',
    'jsonc': 'json',
    'json5': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'toml': 'ini',
    'ini': 'ini',
    'sql': 'sql',
    'graphql': 'graphql',
    'markdown': 'markdown',
    'plaintext': 'plaintext',
    'vue': 'html',
    'svelte': 'html',
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'diff': 'diff',
  };
  return mapping[langId] || 'plaintext';
};

export const TextEditorModal: React.FC<TextEditorModalProps> = ({
  open,
  onClose,
  fileName,
  initialContent,
  onSave,
}) => {
  const { t } = useI18n();
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [languageId, setLanguageId] = useState(() => getLanguageId(fileName));
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  
  // Ref to store the latest save function to avoid stale closure in keyboard shortcut
  const handleSaveRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Track theme from document.documentElement class (syncs with app theme)
  const [isDarkTheme, setIsDarkTheme] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  // Listen for theme changes via MutationObserver on <html> class
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDarkTheme(root.classList.contains('dark'));
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Reset content when file changes
  useEffect(() => {
    setContent(initialContent);
    setHasChanges(false);
    setLanguageId(getLanguageId(fileName));
  }, [initialContent, fileName]);

  // Track changes
  useEffect(() => {
    setHasChanges(content !== initialContent);
  }, [content, initialContent]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(content);
      setHasChanges(false);
      toast.success(t('sftp.editor.saved'), 'SFTP');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('sftp.editor.saveFailed'),
        'SFTP'
      );
    } finally {
      setSaving(false);
    }
  }, [content, onSave, saving, t]);

  // Keep the ref updated with the latest handleSave function
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  const handleClose = useCallback(() => {
    if (hasChanges) {
      const confirmed = confirm(t('sftp.editor.unsavedChanges'));
      if (!confirmed) return;
    }
    onClose();
  }, [hasChanges, onClose, t]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    setContent(value || '');
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Add save shortcut - use ref to avoid stale closure
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSaveRef.current();
    });

    // Add find shortcut (Ctrl+F / Cmd+F)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      // Trigger Monaco's built-in find widget
      editor.trigger('keyboard', 'actions.find', null);
    });
  }, []);

  // Trigger search dialog
  const handleSearch = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.trigger('keyboard', 'actions.find', null);
      editorRef.current.focus();
    }
  }, []);

  const supportedLanguages = useMemo(() => getSupportedLanguages(), []);
  const monacoLanguage = useMemo(() => languageIdToMonaco(languageId), [languageId]);
  const monacoTheme = isDarkTheme ? 'vs-dark' : 'light';
  const languageOptions = useMemo(
    () => supportedLanguages.map((lang) => ({ value: lang.id, label: lang.name })),
    [supportedLanguages],
  );

  const handleLanguageChange = useCallback((nextValue: string) => {
    setLanguageId(nextValue || 'plaintext');
  }, []);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0" hideCloseButton>
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border/60 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <DialogTitle className="text-sm font-semibold truncate">
                {fileName}
                {hasChanges && <span className="text-primary ml-1">*</span>}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              {/* Search button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleSearch}
                title={t('common.search')}
              >
                <Search size={14} />
              </Button>

              {/* Language selector */}
              <Combobox
                options={languageOptions}
                value={languageId}
                onValueChange={handleLanguageChange}
                placeholder={t('sftp.editor.syntaxHighlight')}
                triggerClassName="h-7 max-w-[180px] min-w-[120px] text-xs"
              />

              {/* Save button */}
              <Button
                variant="default"
                size="sm"
                className="h-7"
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                {saving ? (
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                ) : (
                  <CloudUpload size={14} className="mr-1.5" />
                )}
                {saving ? t('sftp.editor.saving') : t('sftp.editor.save')}
              </Button>

              {/* Close button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleClose}
              >
                <X size={14} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Monaco Editor */}
        <div className="flex-1 min-h-0 relative">
          <Editor
            height="100%"
            language={monacoLanguage}
            value={content}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            theme={monacoTheme}
            loading={
              <div className="absolute inset-0 flex items-center justify-center bg-background">
                <Loader2 size={32} className="animate-spin text-muted-foreground" />
              </div>
            }
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: 'on',
              roundedSelection: false,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
              wordWrap: 'off',
              folding: true,
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              find: {
                addExtraSpaceOnTop: false,
                autoFindInSelection: 'never',
                seedSearchStringFromSelection: 'selection',
              },
            }}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground bg-muted/30 flex-shrink-0">
          <span>
            {getLanguageName(languageId)}
          </span>
          <span>
            {content.split('\n').length} lines • {content.length} characters
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TextEditorModal;
