import React, { useCallback, useMemo, useState } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    ArrowRightLeft,
    ChevronDown,
    Copy,
    LayoutGrid,
    List as ListIcon,
    Loader2,
    MoreVertical,
    Play,
    Plus,
    Search,
    Square,
    Trash2,
    Pencil,
    Zap,
    Globe,
    Server,
    Shuffle,
    SortAsc,
    SortDesc,
    Calendar,
    CalendarClock,
    Check,
} from 'lucide-react';
import { PortForwardingRule, PortForwardingType, Host, GroupNode, SSHKey } from '../domain/models';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from './ui/context-menu';
import { cn } from '../lib/utils';
import { TrafficDiagram } from './TrafficDiagram';
import { DistroAvatar } from './DistroAvatar';
import {
    usePortForwardingState,
    ViewMode,
    SortMode
} from '../application/state/usePortForwardingState';
import {
    startPortForward,
    stopPortForward,
    isBackendAvailable,
} from '../infrastructure/services/portForwardingService';
import { toast } from './ui/toast';

type WizardStep = 'type' | 'local-config' | 'remote-config' | 'destination' | 'host-selection';

interface PortForwardingProps {
    hosts: Host[];
    keys: SSHKey[];
    customGroups: string[];
    onNewHost?: () => void;
}

const TYPE_LABELS: Record<PortForwardingType, string> = {
    local: 'Local Forwarding',
    remote: 'Remote Forwarding',
    dynamic: 'Dynamic Forwarding',
};

const TYPE_DESCRIPTIONS: Record<PortForwardingType, string> = {
    local: 'Local forwarding lets you access a remote server\'s listening port as though it were local.',
    remote: 'Remote forwarding opens a port on the remote machine and forwards connections to the local (current) host.',
    dynamic: 'Dynamic port forwarding turns Netcatty into a SOCKS proxy server. SOCKS proxy server is a protocol to request any connection via a remote host.',
};

const TYPE_ICONS: Record<PortForwardingType, React.ReactNode> = {
    local: <Globe size={16} />,
    remote: <Server size={16} />,
    dynamic: <Shuffle size={16} />,
};

const SORT_LABELS: Record<SortMode, { label: string; icon: React.ReactNode }> = {
    az: { label: 'A-z', icon: <SortAsc size={14} /> },
    za: { label: 'Z-a', icon: <SortDesc size={14} /> },
    newest: { label: 'Newest to oldest', icon: <Calendar size={14} /> },
    oldest: { label: 'Oldest to newest', icon: <CalendarClock size={14} /> },
};

const PortForwarding: React.FC<PortForwardingProps> = ({ hosts, keys, customGroups, onNewHost }) => {
    const {
        rules,
        selectedRuleId,
        viewMode,
        sortMode,
        search,
        setSelectedRuleId,
        setViewMode,
        setSortMode,
        setSearch,
        addRule,
        updateRule,
        deleteRule,
        duplicateRule,
        setRuleStatus,
        filteredRules,
        selectedRule,
    } = usePortForwardingState();

    // Track connecting/stopping states
    const [pendingOperations, setPendingOperations] = useState<Set<string>>(new Set());

    // Start a port forwarding tunnel
    const handleStartTunnel = useCallback(async (rule: PortForwardingRule) => {
        const host = hosts.find(h => h.id === rule.hostId);
        if (!host) {
            setRuleStatus(rule.id, 'error', 'Host not found');
            toast.error('Host not found', `Port Forwarding: ${rule.label}`);
            return;
        }

        setPendingOperations(prev => new Set([...prev, rule.id]));
        let errorShown = false;

        try {
            const result = await startPortForward(
                rule,
                host,
                keys.map(k => ({ id: k.id, privateKey: k.privateKey })),
                (status, error) => {
                    setRuleStatus(rule.id, status, error);
                    // Show toast on error (only once)
                    if (status === 'error' && error && !errorShown) {
                        errorShown = true;
                        toast.error(error, `Port Forwarding: ${rule.label}`);
                    }
                }
            );
            // Show error from result only if not already shown
            if (!result.success && result.error && !errorShown) {
                errorShown = true;
                toast.error(result.error, `Port Forwarding: ${rule.label}`);
            }
        } finally {
            setPendingOperations(prev => {
                const next = new Set(prev);
                next.delete(rule.id);
                return next;
            });
        }
    }, [hosts, keys, setRuleStatus]);

    // Stop a port forwarding tunnel
    const handleStopTunnel = useCallback(async (rule: PortForwardingRule) => {
        setPendingOperations(prev => new Set([...prev, rule.id]));

        try {
            await stopPortForward(rule.id, (status) => {
                setRuleStatus(rule.id, status);
            });
        } finally {
            setPendingOperations(prev => {
                const next = new Set(prev);
                next.delete(rule.id);
                return next;
            });
        }
    }, [setRuleStatus]);


    // Wizard state
    const [showWizard, setShowWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState<WizardStep>('type');
    const [wizardType, setWizardType] = useState<PortForwardingType>('local');
    const [draftRule, setDraftRule] = useState<Partial<PortForwardingRule>>({
        label: '',
        type: 'local',
        localPort: undefined,
        bindAddress: '127.0.0.1',
        remoteHost: '',
        remotePort: undefined,
        hostId: undefined,
    });
    const [isEditing, setIsEditing] = useState(false);
    const [hostSearchQuery, setHostSearchQuery] = useState('');
    const [showHostSelector, setShowHostSelector] = useState(false);
    const [hostSelectorPath, setHostSelectorPath] = useState<string | null>(null);

    // Edit panel state (separate from wizard)
    const [showEditPanel, setShowEditPanel] = useState(false);
    const [editingRule, setEditingRule] = useState<PortForwardingRule | null>(null);
    const [editDraft, setEditDraft] = useState<Partial<PortForwardingRule>>({});

    // New forwarding menu
    const [showNewMenu, setShowNewMenu] = useState(false);

    // Build group tree for host selection
    const buildGroupTree = useMemo<Record<string, GroupNode>>(() => {
        const root: Record<string, GroupNode> = {};
        const insertPath = (path: string, host?: Host) => {
            const parts = path.split('/').filter(Boolean);
            let currentLevel = root;
            let currentPath = '';
            parts.forEach((part, index) => {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                if (!currentLevel[part]) {
                    currentLevel[part] = { name: part, path: currentPath, children: {}, hosts: [] };
                }
                if (host && index === parts.length - 1) currentLevel[part].hosts.push(host);
                currentLevel = currentLevel[part].children;
            });
        };
        customGroups.forEach(path => insertPath(path));
        hosts.forEach(host => insertPath(host.group || 'General', host));
        return root;
    }, [hosts, customGroups]);

    // Flat list of groups with host counts - filtered by current path
    const groupsWithCounts = useMemo(() => {
        const result: { path: string; name: string; count: number }[] = [];
        const traverse = (nodes: Record<string, GroupNode>, parentPath: string = '') => {
            Object.values(nodes).forEach(node => {
                // Only show direct children of current path
                if (hostSelectorPath === null) {
                    // At root, show only top-level groups
                    if (!node.path.includes('/')) {
                        result.push({ path: node.path, name: node.name, count: node.hosts.length });
                    }
                } else {
                    // Show direct children of the selected path
                    const isDirectChild = node.path.startsWith(hostSelectorPath + '/') &&
                        node.path.substring(hostSelectorPath.length + 1).indexOf('/') === -1;
                    if (isDirectChild) {
                        result.push({ path: node.path, name: node.name, count: node.hosts.length });
                    }
                }
                traverse(node.children, node.path);
            });
        };
        traverse(buildGroupTree);
        return result;
    }, [buildGroupTree, hostSelectorPath]);

    // Filter hosts by search and current path
    const filteredHosts = useMemo(() => {
        let result = hosts;

        // Filter by current path
        if (hostSelectorPath !== null) {
            result = result.filter(h => h.group === hostSelectorPath);
        } else {
            // At root level, show hosts without group
            result = result.filter(h => !h.group || h.group === '');
        }

        // Filter by search query
        if (hostSearchQuery.trim()) {
            const q = hostSearchQuery.toLowerCase();
            result = result.filter(h =>
                h.label.toLowerCase().includes(q) ||
                h.hostname.toLowerCase().includes(q) ||
                h.username.toLowerCase().includes(q)
            );
        }

        return result;
    }, [hosts, hostSearchQuery, hostSelectorPath]);

    // Ungrouped hosts
    const ungroupedHosts = useMemo(() => {
        return filteredHosts.filter(h => !h.group || h.group === '');
    }, [filteredHosts]);

    // Reset wizard
    const resetWizard = () => {
        setWizardStep('type');
        setWizardType('local');
        setDraftRule({
            label: '',
            type: 'local',
            localPort: undefined,
            bindAddress: '127.0.0.1',
            remoteHost: '',
            remotePort: undefined,
            hostId: undefined,
        });
        setIsEditing(false);
        setHostSearchQuery('');
    };

    // Start new rule wizard
    const startNewRule = (type: PortForwardingType) => {
        resetWizard();
        setWizardType(type);
        setDraftRule(prev => ({ ...prev, type }));
        setShowWizard(true);
        setShowNewMenu(false);
        // All types start from 'type' selection step
        setWizardStep('type');
    };

    // Edit existing rule - open edit panel
    const startEditRule = (rule: PortForwardingRule) => {
        setEditingRule(rule);
        setEditDraft({ ...rule });
        setShowEditPanel(true);
        setShowWizard(false); // Close wizard if open
    };

    // Save edited rule
    const saveEditedRule = () => {
        if (editingRule && editDraft.id) {
            updateRule(editDraft.id, editDraft);
            setShowEditPanel(false);
            setEditingRule(null);
            setEditDraft({});
        }
    };

    // Close edit panel
    const closeEditPanel = () => {
        setShowEditPanel(false);
        setEditingRule(null);
        setEditDraft({});
        setSelectedRuleId(null);
    };

    // Handle wizard navigation
    const getNextStep = (): WizardStep | null => {
        switch (wizardStep) {
            case 'type':
                if (wizardType === 'dynamic') return 'local-config';
                if (wizardType === 'local') return 'local-config';
                if (wizardType === 'remote') return 'remote-config';
                return null;
            case 'local-config':
                if (wizardType === 'dynamic') return 'host-selection'; // Dynamic needs host selection after local config
                if (wizardType === 'local') return 'destination';
                return null;
            case 'remote-config':
                return 'destination';
            case 'destination':
                return null;
            case 'host-selection':
                return null; // Host selection is the last step for dynamic
            default:
                return null;
        }
    };

    const getPrevStep = (): WizardStep | null => {
        switch (wizardStep) {
            case 'type':
                return null;
            case 'local-config':
                return 'type';
            case 'remote-config':
                return 'type';
            case 'destination':
                if (wizardType === 'local') return 'local-config';
                if (wizardType === 'remote') return 'remote-config';
                return null;
            case 'host-selection':
                return 'local-config';
            default:
                return null;
        }
    };

    const canProceed = (): boolean => {
        switch (wizardStep) {
            case 'type':
                // Dynamic doesn't need host on type step, others do
                if (wizardType === 'dynamic') return true;
                return !!draftRule.hostId;
            case 'local-config':
                return !!(draftRule.localPort && draftRule.localPort > 0 && draftRule.localPort < 65536);
            case 'remote-config':
                return !!(draftRule.localPort && draftRule.localPort > 0 && draftRule.localPort < 65536);
            case 'destination':
                return !!(draftRule.remoteHost && draftRule.remotePort && draftRule.remotePort > 0);
            case 'host-selection':
                return !!draftRule.hostId;
            default:
                return false;
        }
    };

    const isLastStep = (): boolean => {
        return getNextStep() === null;
    };

    // Save rule
    const saveRule = () => {
        // Generate label if not provided
        const label = draftRule.label?.trim() || generateRuleLabel();

        if (isEditing && draftRule.id) {
            updateRule(draftRule.id, { ...draftRule, label });
        } else {
            addRule({
                label,
                type: wizardType,
                localPort: draftRule.localPort!,
                bindAddress: draftRule.bindAddress || '127.0.0.1',
                remoteHost: draftRule.remoteHost,
                remotePort: draftRule.remotePort,
                hostId: draftRule.hostId,
            });
        }

        setShowWizard(false);
        resetWizard();
    };

    const generateRuleLabel = (): string => {
        const host = hosts.find(h => h.id === draftRule.hostId);
        const hostLabel = host?.label || 'Unknown';

        switch (wizardType) {
            case 'local':
                return `Local:${draftRule.localPort} → ${draftRule.remoteHost}:${draftRule.remotePort}`;
            case 'remote':
                return `Remote:${draftRule.localPort} → ${draftRule.remoteHost}:${draftRule.remotePort}`;
            case 'dynamic':
                return `SOCKS:${draftRule.localPort}`;
            default:
                return 'New Rule';
        }
    };

    // Handle skip wizard (just save with defaults)
    const skipWizard = () => {
        setShowWizard(false);
        resetWizard();
    };

    // Render rule card
    const renderRuleCard = (rule: PortForwardingRule) => {
        const isSelected = selectedRuleId === rule.id;

        return (
            <ContextMenu key={rule.id}>
                <ContextMenuTrigger>
                    <Card
                        className={cn(
                            "cursor-pointer soft-card rounded-xl border transition-all group",
                            isSelected ? "border-primary/70 ring-2 ring-primary/20" : "border-border/60 hover:border-primary/40",
                            viewMode === 'list' ? "w-full" : ""
                        )}
                        onClick={() => {
                            setSelectedRuleId(rule.id);
                            startEditRule(rule);
                        }}
                    >
                        <CardContent className={cn("p-4 flex items-center gap-3", viewMode === 'list' ? "py-3" : "")}>
                            <div className={cn(
                                "h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold transition-colors",
                                rule.status === 'active' ? (
                                    rule.type === 'local' ? "bg-blue-500 text-white" :
                                        rule.type === 'remote' ? "bg-orange-500 text-white" :
                                            "bg-purple-500 text-white"
                                ) : (
                                    rule.type === 'local' ? "bg-blue-500/15 text-blue-500" :
                                        rule.type === 'remote' ? "bg-orange-500/15 text-orange-500" :
                                            "bg-purple-500/15 text-purple-500"
                                )
                            )}>
                                {rule.type[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold truncate">{rule.label}</span>
                                    <span
                                        className={cn(
                                            "h-2 w-2 rounded-full flex-shrink-0",
                                            rule.status === 'active' ? "bg-emerald-500" :
                                                rule.status === 'connecting' ? "bg-yellow-500 animate-pulse" :
                                                    rule.status === 'error' ? "bg-red-500" :
                                                        "bg-muted-foreground/40"
                                        )}
                                        title={rule.status === 'error' && rule.error ? rule.error : undefined}
                                    />
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <span className="truncate">
                                        {rule.type === 'dynamic'
                                            ? `SOCKS on ${rule.bindAddress}:${rule.localPort}`
                                            : `${rule.bindAddress}:${rule.localPort} → ${rule.remoteHost}:${rule.remotePort}`
                                        }
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {pendingOperations.has(rule.id) ? (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        disabled
                                    >
                                        <Loader2 size={12} className="animate-spin" />
                                    </Button>
                                ) : rule.status === 'inactive' || rule.status === 'error' ? (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleStartTunnel(rule);
                                        }}
                                    >
                                        <Play size={12} />
                                    </Button>
                                ) : rule.status === 'active' || rule.status === 'connecting' ? (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleStopTunnel(rule);
                                        }}
                                    >
                                        <Square size={12} />
                                    </Button>
                                ) : null}
                            </div>
                        </CardContent>
                    </Card>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => startEditRule(rule)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => duplicateRule(rule.id)}>
                        <Copy className="mr-2 h-4 w-4" /> Duplicate
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    {(rule.status === 'inactive' || rule.status === 'error') && (
                        <ContextMenuItem onClick={() => handleStartTunnel(rule)}>
                            <Play className="mr-2 h-4 w-4" /> Start
                        </ContextMenuItem>
                    )}
                    {(rule.status === 'active' || rule.status === 'connecting') && (
                        <ContextMenuItem onClick={() => handleStopTunnel(rule)}>
                            <Square className="mr-2 h-4 w-4" /> Stop
                        </ContextMenuItem>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem className="text-destructive" onClick={() => deleteRule(rule.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
        );
    };

    // Render wizard panel content
    const renderWizardContent = () => {
        const selectedHost = hosts.find(h => h.id === draftRule.hostId);

        switch (wizardStep) {
            case 'type':
                return (
                    <>
                        <div className="text-sm font-medium mb-3">Select the port forwarding type:</div>
                        <div className="flex gap-1 p-1 bg-secondary/80 rounded-lg border border-border/60">
                            {(['local', 'remote', 'dynamic'] as PortForwardingType[]).map((type) => (
                                <Button
                                    key={type}
                                    variant={wizardType === type ? 'default' : 'ghost'}
                                    size="sm"
                                    className={cn(
                                        "flex-1 h-9",
                                        wizardType === type ? "bg-primary text-primary-foreground" : ""
                                    )}
                                    onClick={() => {
                                        setWizardType(type);
                                        setDraftRule(prev => ({ ...prev, type }));
                                    }}
                                >
                                    {type[0].toUpperCase() + type.slice(1)}
                                </Button>
                            ))}
                        </div>

                        <div className="mt-6">
                            <TrafficDiagram type={wizardType} isAnimating={true} />
                        </div>

                        <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
                            {TYPE_DESCRIPTIONS[wizardType]}
                        </p>

                        {/* Host Selection Button */}
                        {wizardType !== 'dynamic' && (
                            <div className="mt-6">
                                <div className="text-sm font-medium mb-3">
                                    {wizardType === 'local' ? 'Select the SSH tunnel host:' : 'Select the remote host:'}
                                </div>
                                <Button
                                    variant="default"
                                    className="w-full h-11"
                                    onClick={() => setShowHostSelector(true)}
                                >
                                    {selectedHost ? (
                                        <div className="flex items-center gap-2">
                                            <DistroAvatar host={selectedHost} fallback={selectedHost.os[0].toUpperCase()} className="h-6 w-6" />
                                            <span>{selectedHost.label}</span>
                                            <Check size={14} className="ml-auto" />
                                        </div>
                                    ) : (
                                        'Select a host'
                                    )}
                                </Button>
                            </div>
                        )}
                    </>
                );

            case 'local-config':
                return (
                    <>
                        <div className="text-sm font-medium mb-3">Set the local port and binding address:</div>

                        <TrafficDiagram type={wizardType} isAnimating={true} />

                        <p className="text-sm text-muted-foreground mt-2 mb-4 leading-relaxed">
                            This port will be open on the local (current) device, and it will receive the traffic.
                        </p>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs">Local port number *</Label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 8080"
                                    className="h-10"
                                    value={draftRule.localPort || ''}
                                    onChange={e => setDraftRule(prev => ({ ...prev, localPort: parseInt(e.target.value) || undefined }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Bind address</Label>
                                <Input
                                    placeholder="127.0.0.1"
                                    className="h-10"
                                    value={draftRule.bindAddress || ''}
                                    onChange={e => setDraftRule(prev => ({ ...prev, bindAddress: e.target.value }))}
                                />
                            </div>
                        </div>
                    </>
                );

            case 'remote-config':
                return (
                    <>
                        <div className="text-sm font-medium mb-3">Set the remote port to open:</div>

                        <TrafficDiagram type={wizardType} isAnimating={true} />

                        <p className="text-sm text-muted-foreground mt-2 mb-4 leading-relaxed">
                            This port will be opened on the remote host and will forward traffic to the destination.
                        </p>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs">Remote port number *</Label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 8080"
                                    className="h-10"
                                    value={draftRule.localPort || ''}
                                    onChange={e => setDraftRule(prev => ({ ...prev, localPort: parseInt(e.target.value) || undefined }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Bind address on remote</Label>
                                <Input
                                    placeholder="127.0.0.1"
                                    className="h-10"
                                    value={draftRule.bindAddress || ''}
                                    onChange={e => setDraftRule(prev => ({ ...prev, bindAddress: e.target.value }))}
                                />
                            </div>
                        </div>
                    </>
                );

            case 'destination':
                return (
                    <>
                        <div className="text-sm font-medium mb-3">Set the destination:</div>

                        <TrafficDiagram type={wizardType} isAnimating={true} />

                        <p className="text-sm text-muted-foreground mt-2 mb-4 leading-relaxed">
                            {wizardType === 'local'
                                ? 'Enter the remote destination that you want to access through the tunnel.'
                                : 'Enter the local destination where traffic will be forwarded.'
                            }
                        </p>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs">Destination host *</Label>
                                <Input
                                    placeholder="e.g. localhost or 192.168.1.100"
                                    className="h-10"
                                    value={draftRule.remoteHost || ''}
                                    onChange={e => setDraftRule(prev => ({ ...prev, remoteHost: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Destination port *</Label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 3306"
                                    className="h-10"
                                    value={draftRule.remotePort || ''}
                                    onChange={e => setDraftRule(prev => ({ ...prev, remotePort: parseInt(e.target.value) || undefined }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs">Rule label (optional)</Label>
                                <Input
                                    placeholder="e.g. MySQL Production"
                                    className="h-10"
                                    value={draftRule.label || ''}
                                    onChange={e => setDraftRule(prev => ({ ...prev, label: e.target.value }))}
                                />
                            </div>
                        </div>
                    </>
                );

            case 'host-selection':
                return (
                    <>
                        <div className="text-sm font-medium mb-3">Select the intermediate host:</div>

                        <TrafficDiagram type={wizardType} isAnimating={true} />

                        <p className="text-sm text-muted-foreground mt-2 mb-4 leading-relaxed">
                            The intermediate host will receive the traffic that will be forwarded to the local (current) host.
                        </p>

                        <Button
                            variant="default"
                            className="w-full h-11"
                            onClick={() => setShowHostSelector(true)}
                        >
                            {selectedHost ? (
                                <div className="flex items-center gap-2 w-full">
                                    <DistroAvatar host={selectedHost} fallback={selectedHost.os[0].toUpperCase()} className="h-6 w-6" />
                                    <span>{selectedHost.label}</span>
                                    <Check size={14} className="ml-auto" />
                                </div>
                            ) : (
                                'Select a host'
                            )}
                        </Button>

                        {/* Rule label for dynamic */}
                        <div className="space-y-2 mt-6">
                            <Label className="text-xs">Rule label (optional)</Label>
                            <Input
                                placeholder="e.g. SOCKS Proxy"
                                className="h-10"
                                value={draftRule.label || ''}
                                onChange={e => setDraftRule(prev => ({ ...prev, label: e.target.value }))}
                            />
                        </div>
                    </>
                );

            default:
                return null;
        }
    };

    const hasRules = filteredRules.length > 0;

    return (
        <div className="flex h-full">
            {/* Main Content */}
            <div className={cn("flex-1 flex flex-col min-h-0", (showWizard || showEditPanel) ? "mr-[360px]" : "")}>
                {/* Toolbar */}
                <div className="h-14 px-4 flex items-center gap-3 bg-secondary/60 border-b border-border/60">
                    <Popover open={showNewMenu} onOpenChange={setShowNewMenu}>
                        <PopoverTrigger asChild>
                            <Button variant="secondary" className="h-9 px-3 gap-2">
                                <Zap size={14} />
                                NEW FORWARDING
                                <ChevronDown size={14} className={cn("transition-transform", showNewMenu ? "rotate-180" : "")} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-52 p-1" align="start">
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-3 h-10"
                                onClick={() => startNewRule('local')}
                            >
                                <Globe size={16} className="text-blue-500" />
                                Local Forwarding
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-3 h-10"
                                onClick={() => startNewRule('remote')}
                            >
                                <Server size={16} className="text-orange-500" />
                                Remote Forwarding
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-3 h-10"
                                onClick={() => startNewRule('dynamic')}
                            >
                                <Shuffle size={16} className="text-purple-500" />
                                Dynamic Forwarding
                            </Button>
                        </PopoverContent>
                    </Popover>

                    <div className="ml-auto flex items-center gap-2">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search..."
                                className="h-9 pl-8 w-44"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>

                        {/* View mode toggle */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9">
                                    {viewMode === 'grid' ? <LayoutGrid size={16} /> : <ListIcon size={16} />}
                                    <ChevronDown size={10} className="ml-0.5" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-32 p-1" align="end">
                                <Button
                                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                                    className="w-full justify-start gap-2 h-9"
                                    onClick={() => setViewMode('grid')}
                                >
                                    <LayoutGrid size={14} /> Grid
                                    {viewMode === 'grid' && <Check size={12} className="ml-auto" />}
                                </Button>
                                <Button
                                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                                    className="w-full justify-start gap-2 h-9"
                                    onClick={() => setViewMode('list')}
                                >
                                    <ListIcon size={14} /> List
                                    {viewMode === 'list' && <Check size={12} className="ml-auto" />}
                                </Button>
                            </PopoverContent>
                        </Popover>

                        {/* Sort mode toggle */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9">
                                    {SORT_LABELS[sortMode].icon}
                                    <ChevronDown size={10} className="ml-0.5" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-44 p-1" align="end">
                                {(Object.keys(SORT_LABELS) as SortMode[]).map(mode => (
                                    <Button
                                        key={mode}
                                        variant={sortMode === mode ? 'secondary' : 'ghost'}
                                        className="w-full justify-start gap-2 h-9"
                                        onClick={() => setSortMode(mode)}
                                    >
                                        {SORT_LABELS[mode].icon} {SORT_LABELS[mode].label}
                                        {sortMode === mode && <Check size={12} className="ml-auto" />}
                                    </Button>
                                ))}
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* Rules List */}
                <div className="flex-1 overflow-auto p-4">
                    {!hasRules ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <div className="h-16 w-16 rounded-2xl bg-secondary/80 flex items-center justify-center mb-4">
                                <Zap size={32} className="opacity-60" />
                            </div>
                            <h3 className="text-lg font-semibold text-foreground mb-2">Set up port forwarding</h3>
                            <p className="text-sm text-center max-w-sm">
                                Save port forwarding to access databases, web apps, and other services.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-base font-semibold">Port Forwarding</h2>
                                <span className="text-xs text-muted-foreground">{filteredRules.length} rules</span>
                            </div>

                            <div className={cn(
                                viewMode === 'grid'
                                    ? "grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                                    : "space-y-2"
                            )}>
                                {filteredRules.map(rule => renderRuleCard(rule))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit Panel - shown when a rule is selected */}
            {showEditPanel && editingRule && (
                <div className="fixed right-0 top-0 bottom-0 w-[360px] bg-secondary/95 border-l border-border/70 flex flex-col z-50">
                    {/* Header */}
                    <div className="px-4 py-3 flex items-center justify-between border-b border-border/60">
                        <div>
                            <h3 className="text-sm font-semibold">Edit Port Forwarding</h3>
                            <p className="text-xs text-muted-foreground">Personal vault</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreVertical size={16} />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-40 p-1" align="end">
                                    <Button
                                        variant="ghost"
                                        className="w-full justify-start gap-2 h-9"
                                        onClick={() => {
                                            duplicateRule(editingRule.id);
                                            closeEditPanel();
                                        }}
                                    >
                                        <Copy size={14} /> Duplicate
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        className="w-full justify-start gap-2 h-9 text-destructive"
                                        onClick={() => {
                                            deleteRule(editingRule.id);
                                            closeEditPanel();
                                        }}
                                    >
                                        <Trash2 size={14} /> Delete
                                    </Button>
                                </PopoverContent>
                            </Popover>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeEditPanel}>
                                <ArrowRight size={16} />
                            </Button>
                        </div>
                    </div>

                    {/* Content */}
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-6">
                            {/* Traffic Diagram */}
                            <TrafficDiagram type={editDraft.type || editingRule.type} isAnimating={true} />

                            {/* Label */}
                            <div className="space-y-2">
                                <Label className="text-xs">Label</Label>
                                <Input
                                    placeholder="Rule label"
                                    className="h-10"
                                    value={editDraft.label || ''}
                                    onChange={e => setEditDraft(prev => ({ ...prev, label: e.target.value }))}
                                />
                            </div>

                            {/* Local Port */}
                            <div className="space-y-2">
                                <Label className="text-xs">Local port number *</Label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 8080"
                                    className="h-10"
                                    value={editDraft.localPort || ''}
                                    onChange={e => setEditDraft(prev => ({ ...prev, localPort: parseInt(e.target.value) || undefined }))}
                                />
                            </div>

                            {/* Bind Address */}
                            <div className="space-y-2">
                                <Label className="text-xs">Bind address</Label>
                                <Input
                                    placeholder="127.0.0.1"
                                    className="h-10"
                                    value={editDraft.bindAddress || ''}
                                    onChange={e => setEditDraft(prev => ({ ...prev, bindAddress: e.target.value }))}
                                />
                            </div>

                            {/* Intermediate Host - for all types */}
                            <div className="space-y-2">
                                <Label className="text-xs">Intermediate host *</Label>
                                <Button
                                    variant="secondary"
                                    className="w-full h-10 justify-between"
                                    onClick={() => {
                                        setShowHostSelector(true);
                                        // When host is selected, update editDraft instead of draftRule
                                    }}
                                >
                                    {hosts.find(h => h.id === editDraft.hostId) ? (
                                        <div className="flex items-center gap-2">
                                            <DistroAvatar
                                                host={hosts.find(h => h.id === editDraft.hostId)!}
                                                fallback={hosts.find(h => h.id === editDraft.hostId)!.os[0].toUpperCase()}
                                                className="h-6 w-6"
                                            />
                                            <span>{hosts.find(h => h.id === editDraft.hostId)?.label}</span>
                                        </div>
                                    ) : (
                                        <span className="text-muted-foreground">Select a host</span>
                                    )}
                                    <ChevronDown size={14} />
                                </Button>
                            </div>

                            {/* Destination - for local/remote only */}
                            {(editDraft.type === 'local' || editDraft.type === 'remote') && (
                                <>
                                    <div className="space-y-2">
                                        <Label className="text-xs">Destination address *</Label>
                                        <Input
                                            placeholder="e.g. localhost or 192.168.1.100"
                                            className="h-10"
                                            value={editDraft.remoteHost || ''}
                                            onChange={e => setEditDraft(prev => ({ ...prev, remoteHost: e.target.value }))}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs">Destination port number *</Label>
                                        <Input
                                            type="number"
                                            placeholder="e.g. 3306"
                                            className="h-10"
                                            value={editDraft.remotePort || ''}
                                            onChange={e => setEditDraft(prev => ({ ...prev, remotePort: parseInt(e.target.value) || undefined }))}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </ScrollArea>

                    {/* Footer */}
                    <div className="p-4 border-t border-border/60 space-y-2">
                        <Button
                            className="w-full h-10"
                            onClick={saveEditedRule}
                        >
                            Save Changes
                        </Button>
                        <Button
                            variant="ghost"
                            className="w-full h-10 text-muted-foreground hover:text-foreground"
                            onClick={closeEditPanel}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* Wizard Panel */}
            {showWizard && (
                <div className="fixed right-0 top-0 bottom-0 w-[360px] bg-secondary/95 border-l border-border/70 flex flex-col z-50">
                    {/* Header */}
                    <div className="px-4 py-3 flex items-center justify-between border-b border-border/60">
                        <div>
                            <h3 className="text-sm font-semibold">
                                {isEditing ? 'Edit Port Forwarding' : 'New Port Forwarding'}
                            </h3>
                            <p className="text-xs text-muted-foreground">Personal vault</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            setShowWizard(false);
                            resetWizard();
                        }}>
                            <ArrowRight size={16} />
                        </Button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto p-4">
                        {/* Back button */}
                        {getPrevStep() && (
                            <button
                                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 mb-4"
                                onClick={() => {
                                    const prev = getPrevStep();
                                    if (prev) setWizardStep(prev);
                                }}
                            >
                                <ArrowLeft size={14} /> Back
                            </button>
                        )}

                        {renderWizardContent()}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-border/60 space-y-2">
                        <Button
                            className="w-full h-10"
                            disabled={!canProceed()}
                            onClick={() => {
                                if (isLastStep()) {
                                    saveRule();
                                } else {
                                    const next = getNextStep();
                                    if (next) setWizardStep(next);
                                }
                            }}
                        >
                            {isLastStep() ? (isEditing ? 'Save Changes' : 'Create Rule') : 'Continue'}
                        </Button>
                        <Button
                            variant="ghost"
                            className="w-full h-10 text-muted-foreground hover:text-foreground"
                            onClick={skipWizard}
                        >
                            {isEditing ? 'Cancel' : 'Skip wizard'}
                        </Button>
                    </div>
                </div>
            )}

            {/* Host Selector Overlay - Same width as wizard panel */}
            {showHostSelector && (
                <div className="fixed right-0 top-0 bottom-0 w-[360px] bg-background z-[60] flex flex-col border-l border-border/70">
                    {/* Header */}
                    <div className="px-4 py-3 flex items-center gap-3 border-b border-border/60 bg-secondary/60">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (hostSelectorPath !== null) {
                                    // Navigate up one level
                                    const parts = hostSelectorPath.split('/').filter(Boolean);
                                    parts.pop();
                                    setHostSelectorPath(parts.length > 0 ? parts.join('/') : null);
                                } else {
                                    // Close the selector and return to wizard
                                    setShowHostSelector(false);
                                    setHostSearchQuery('');
                                }
                            }}
                        >
                            <ArrowLeft size={18} />
                        </Button>
                        <div>
                            <h3 className="text-sm font-semibold">Select Host</h3>
                            <p className="text-xs text-muted-foreground">{hostSelectorPath || 'Personal vault'}</p>
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className="px-4 py-3 flex items-center gap-2 border-b border-border/60">
                        <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={() => {
                                if (onNewHost) {
                                    setShowHostSelector(false);
                                    onNewHost();
                                }
                            }}
                        >
                            <Plus size={14} />
                            NEW HOST
                        </Button>
                        <div className="relative flex-1 max-w-xs">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search"
                                className="h-8 pl-8"
                                value={hostSearchQuery}
                                onChange={e => setHostSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="ml-auto flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <LayoutGrid size={14} />
                                <ChevronDown size={10} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical size={14} />
                                <ChevronDown size={10} />
                            </Button>
                        </div>
                    </div>

                    {/* Content */}
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-4">
                            {/* Groups Section */}
                            {groupsWithCounts.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold mb-3">Groups</h4>
                                    <div className="space-y-1">
                                        {groupsWithCounts.map(group => (
                                            <div
                                                key={group.path}
                                                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary cursor-pointer"
                                                onClick={() => setHostSelectorPath(group.path)}
                                            >
                                                <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                                                    <LayoutGrid size={18} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium">{group.name}</div>
                                                    <div className="text-xs text-muted-foreground">{group.count} Host{group.count !== 1 ? 's' : ''}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Hosts Section */}
                            <div>
                                <h4 className="text-sm font-semibold mb-3">Hosts</h4>
                                <div className="space-y-1">
                                    {filteredHosts.map(host => {
                                        const isSelectedInWizard = draftRule.hostId === host.id;
                                        const isSelectedInEdit = editDraft.hostId === host.id;
                                        const isSelected = showEditPanel ? isSelectedInEdit : isSelectedInWizard;

                                        return (
                                            <div
                                                key={host.id}
                                                className={cn(
                                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                                                    isSelected
                                                        ? "bg-primary/15 border border-primary/30"
                                                        : "hover:bg-secondary"
                                                )}
                                                onClick={() => {
                                                    if (showEditPanel) {
                                                        setEditDraft(prev => ({ ...prev, hostId: host.id }));
                                                    } else {
                                                        setDraftRule(prev => ({ ...prev, hostId: host.id }));
                                                    }
                                                    setShowHostSelector(false);
                                                    setHostSearchQuery('');
                                                    setHostSelectorPath(null);
                                                }}
                                            >
                                                <DistroAvatar host={host} fallback={host.os[0].toUpperCase()} className="h-10 w-10" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium">{host.label}</div>
                                                    <div className="text-xs text-muted-foreground truncate">
                                                        {host.protocol || 'ssh'}, {host.username}
                                                    </div>
                                                </div>
                                                {isSelected && (
                                                    <Check size={16} className="text-primary" />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </ScrollArea>

                    {/* Footer */}
                    <div className="p-4 border-t border-border/60">
                        <Button
                            className="w-full h-10"
                            disabled={showEditPanel ? !editDraft.hostId : !draftRule.hostId}
                            onClick={() => {
                                setShowHostSelector(false);
                                setHostSearchQuery('');
                                setHostSelectorPath(null);
                            }}
                        >
                            Continue
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PortForwarding;
