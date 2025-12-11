/**
 * Generate Biometric Key Panel - Windows Hello / Touch ID
 */

import { Fingerprint } from 'lucide-react';
import React from 'react';
import { SSHKey } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { isMacOS } from './utils';

interface GenerateBiometricPanelProps {
    draftKey: Partial<SSHKey>;
    setDraftKey: (key: Partial<SSHKey>) => void;
    isGenerating: boolean;
    onGenerate: () => void;
}

export const GenerateBiometricPanel: React.FC<GenerateBiometricPanelProps> = ({
    draftKey,
    setDraftKey,
    isGenerating,
    onGenerate,
}) => {
    const isMac = isMacOS();

    return (
        <>
            {/* Keyboard illustration */}
            <div className="bg-card border border-border/80 rounded-lg p-3 flex items-center justify-center overflow-hidden">
                <div className="text-center w-full">
                    <div className="flex justify-center items-center gap-0.5 mb-1.5">
                        {['9', '0', ')', '-', '+', '='].map((k, i) => (
                            <div key={i} className="w-6 h-6 bg-secondary border border-border/60 rounded text-[10px] flex items-center justify-center flex-shrink-0">
                                {k}
                            </div>
                        ))}
                        <div className="w-12 h-6 bg-secondary border border-border/60 rounded text-[9px] flex items-center justify-center flex-shrink-0">
                            back
                        </div>
                        <div className="w-8 h-8 bg-blue-500/20 border border-blue-500/40 rounded-lg flex items-center justify-center ml-1.5 flex-shrink-0">
                            <Fingerprint size={16} className="text-blue-500" />
                        </div>
                    </div>
                    <div className="flex justify-center gap-0.5">
                        {['I', 'O', 'P', '[', ']', '{', '}'].map((k, i) => (
                            <div key={i} className="w-6 h-6 bg-secondary border border-border/60 rounded text-[10px] flex items-center justify-center flex-shrink-0">
                                {k}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <p className="text-sm text-muted-foreground text-center">
                Biometric Key based on Secure Enclave Process built-in into your {isMac ? 'mac' : 'system'}. This key is not possible to copy or steal.
            </p>

            <div className="space-y-2">
                <Label>Label</Label>
                <Input
                    value={draftKey.label || ''}
                    onChange={e => setDraftKey({ ...draftKey, label: e.target.value })}
                    placeholder={isMac ? 'Touch ID' : 'Windows Hello'}
                />
            </div>

            <div className="space-y-1">
                <Label className="text-muted-foreground">Type</Label>
                <p className="text-sm">ECDSA</p>
            </div>

            <div className="space-y-1">
                <Label className="text-muted-foreground">Key Size</Label>
                <p className="text-sm">256</p>
            </div>

            <Button
                className="w-full h-11"
                onClick={onGenerate}
                disabled={isGenerating || !draftKey.label?.trim()}
            >
                {isGenerating ? (
                    <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                    'Generate'
                )}
            </Button>
        </>
    );
};
