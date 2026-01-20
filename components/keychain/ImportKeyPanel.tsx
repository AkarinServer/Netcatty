/**
 * Import Key Panel - Import existing SSH key
 */

import { Upload } from 'lucide-react';
import React,{ useCallback,useRef } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { SSHKey } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { detectKeyType } from './utils';

interface ImportKeyPanelProps {
    draftKey: Partial<SSHKey>;
    setDraftKey: (key: Partial<SSHKey>) => void;
    onImport: () => void;
}

export const ImportKeyPanel: React.FC<ImportKeyPanelProps> = ({
    draftKey,
    setDraftKey,
    onImport,
}) => {
    const { t } = useI18n();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (content) {
                const detectedType = detectKeyType(content);
                const label = file.name.replace(/\.(pem|key|pub|ppk)$/i, '');

                setDraftKey({
                    ...draftKey,
                    privateKey: content,
                    label: draftKey.label || label,
                    type: detectedType,
                });
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }, [draftKey, setDraftKey]);

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();

        const file = event.dataTransfer.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (content) {
                const detectedType = detectKeyType(content);
                const label = file.name.replace(/\.(pem|key|pub|ppk)$/i, '');

                setDraftKey({
                    ...draftKey,
                    privateKey: content,
                    label: draftKey.label || label,
                    type: detectedType,
                });
            }
        };
        reader.readAsText(file);
    }, [draftKey, setDraftKey]);

    const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    }, []);

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileImport}
            />

            <div className="space-y-2">
                <Label>{t('keychain.field.label')}</Label>
                <Input
                    value={draftKey.label || ''}
                    onChange={e => setDraftKey({ ...draftKey, label: e.target.value })}
                    placeholder={t('keychain.field.labelPlaceholder')}
                />
            </div>

            <div className="space-y-2">
                <Label>{t('keychain.field.privateKeyRequired')}</Label>
                <Textarea
                    value={draftKey.privateKey || ''}
                    onChange={e => setDraftKey({ ...draftKey, privateKey: e.target.value })}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    className="min-h-[120px] font-mono text-xs"
                />
            </div>

            <div className="space-y-2">
                <Label>{t('keychain.field.publicKey')}</Label>
                <Textarea
                    value={draftKey.publicKey || ''}
                    onChange={e => setDraftKey({ ...draftKey, publicKey: e.target.value })}
                    placeholder="ssh-ed25519 AAAAC3... user@host"
                    className="min-h-[80px] font-mono text-xs"
                />
            </div>

            <div className="space-y-2">
                <Label className="flex items-center gap-2">
                    {t('terminal.auth.certificate')}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {t('common.optional')}
                    </span>
                </Label>
                <Textarea
                    value={draftKey.certificate || ''}
                    onChange={e => setDraftKey({ ...draftKey, certificate: e.target.value })}
                    placeholder={t('keychain.field.certificatePlaceholder')}
                    className="min-h-[80px] font-mono text-xs"
                />
            </div>

            <div
                className="border border-dashed border-border/80 rounded-xl p-4 text-center space-y-2 bg-background/60 transition-colors hover:border-primary/50"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Upload size={16} />
                    <span className="text-sm">{t('keychain.import.dropHint')}</span>
                </div>
                <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                >
                    {t('keychain.import.importFromFile')}
                </Button>
            </div>

            <Button
                className="w-full h-11"
                onClick={onImport}
                disabled={!draftKey.label?.trim() || !draftKey.privateKey?.trim()}
            >
                {t('keychain.import.saveKey')}
            </Button>
        </>
    );
};
