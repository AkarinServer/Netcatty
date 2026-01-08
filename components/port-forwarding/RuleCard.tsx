/**
 * Port Forwarding Rule Card
 * Displays a single port forwarding rule in grid or list view
 */
import { Copy,Loader2,Pencil,Play,Square,Trash2 } from 'lucide-react';
import React from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { PortForwardingRule } from '../../domain/models';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { ContextMenu,ContextMenuContent,ContextMenuItem,ContextMenuSeparator,ContextMenuTrigger } from '../ui/context-menu';
import { getStatusColor,getTypeColor } from './utils';

export type ViewMode = 'grid' | 'list';

export interface RuleCardProps {
    rule: PortForwardingRule;
    viewMode: ViewMode;
    isSelected: boolean;
    isPending: boolean;
    onSelect: () => void;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onStart: () => void;
    onStop: () => void;
}

export const RuleCard: React.FC<RuleCardProps> = ({
    rule,
    viewMode,
    isSelected,
    isPending,
    onSelect,
    onEdit,
    onDuplicate,
    onDelete,
    onStart,
    onStop,
}) => {
    const { t } = useI18n();
    const isActive = rule.status === 'active';
    const isInactive = rule.status === 'inactive' || rule.status === 'error';

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <div
                    className={cn(
                        "group cursor-pointer",
                        viewMode === 'grid'
                            ? "soft-card elevate rounded-xl h-[68px] px-3 py-2"
                            : "h-14 px-3 py-2 hover:bg-secondary/60 rounded-lg transition-colors",
                        isSelected && "ring-2 ring-primary"
                    )}
                    onClick={onSelect}
                >
                    <div className="flex items-center gap-3 h-full">
                        <div className={cn(
                            "h-11 w-11 rounded-xl flex items-center justify-center text-sm font-bold transition-colors",
                            getTypeColor(rule.type, isActive)
                        )}>
                            {rule.type[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold truncate">{rule.label}</span>
                                <span
                                    className={cn(
                                        "h-2 w-2 rounded-full flex-shrink-0",
                                        getStatusColor(rule.status)
                                    )}
                                    title={rule.status === 'error' && rule.error ? rule.error : undefined}
                                />
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="truncate">
                                    {rule.type === 'dynamic'
                                        ? t('pf.rule.summary.dynamic', { bindAddress: rule.bindAddress, localPort: rule.localPort })
                                        : t('pf.rule.summary.default', { bindAddress: rule.bindAddress, localPort: rule.localPort, remoteHost: rule.remoteHost, remotePort: rule.remotePort })
                                    }
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isPending ? (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    disabled
                                >
                                    <Loader2 size={12} className="animate-spin" />
                                </Button>
                            ) : isInactive ? (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onStart();
                                    }}
                                >
                                    <Play size={12} />
                                </Button>
                            ) : (rule.status === 'active' || rule.status === 'connecting') ? (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onStop();
                                    }}
                                >
                                    <Square size={12} />
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                <ContextMenuItem onClick={onEdit}>
                    <Pencil className="mr-2 h-4 w-4" /> {t('action.edit')}
                </ContextMenuItem>
                <ContextMenuItem onClick={onDuplicate}>
                    <Copy className="mr-2 h-4 w-4" /> {t('action.duplicate')}
                </ContextMenuItem>
                <ContextMenuSeparator />
                {isInactive && (
                    <ContextMenuItem onClick={onStart}>
                        <Play className="mr-2 h-4 w-4" /> {t('action.start')}
                    </ContextMenuItem>
                )}
                {(rule.status === 'active' || rule.status === 'connecting') && (
                    <ContextMenuItem onClick={onStop}>
                        <Square className="mr-2 h-4 w-4" /> {t('action.stop')}
                    </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem className="text-destructive" onClick={onDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> {t('action.delete')}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
};

export default RuleCard;
