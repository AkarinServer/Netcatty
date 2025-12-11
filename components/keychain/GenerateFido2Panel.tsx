/**
 * Generate FIDO2 Key Panel - Hardware security key (YubiKey, etc.)
 */

import { Shield } from 'lucide-react';
import React from 'react';
import { SSHKey } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface GenerateFido2PanelProps {
    draftKey: Partial<SSHKey>;
    setDraftKey: (key: Partial<SSHKey>) => void;
    isGenerating: boolean;
    onGenerate: () => void;
}

export const GenerateFido2Panel: React.FC<GenerateFido2PanelProps> = ({
    draftKey,
    setDraftKey,
    isGenerating,
    onGenerate,
}) => {
    return (
        <>
            {/* Security key illustration */}
            <div className="bg-card border border-border/80 rounded-lg p-4 flex items-center justify-center">
                <div className="text-center">
                    <div className="flex justify-center mb-3">
                        <div className="w-20 h-12 bg-gradient-to-b from-zinc-600 to-zinc-800 rounded-lg flex items-center justify-center border border-zinc-500/50 shadow-lg">
                            <div className="w-4 h-6 bg-amber-500/80 rounded-sm" />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">YubiKey or compatible device</p>
                </div>
            </div>

            <p className="text-sm text-muted-foreground text-center">
                Connect your hardware security key (YubiKey, Titan, etc.) and touch it when prompted. The private key never leaves the device.
            </p>

            <div className="space-y-2">
                <Label>Label</Label>
                <Input
                    value={draftKey.label || ''}
                    onChange={e => setDraftKey({ ...draftKey, label: e.target.value })}
                    placeholder="My YubiKey"
                />
            </div>

            <div className="space-y-1">
                <Label className="text-muted-foreground">Type</Label>
                <p className="text-sm">ECDSA (Hardware-backed)</p>
            </div>

            <div className="space-y-1">
                <Label className="text-muted-foreground">Key Size</Label>
                <p className="text-sm">P-256</p>
            </div>

            <Button
                className="w-full h-11"
                onClick={onGenerate}
                disabled={isGenerating || !draftKey.label?.trim()}
            >
                {isGenerating ? (
                    <div className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                    <>
                        <Shield size={14} className="mr-2" />
                        Register Security Key
                    </>
                )}
            </Button>
        </>
    );
};
