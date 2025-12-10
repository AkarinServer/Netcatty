import React, { useMemo, useState } from 'react';
import { Host } from '../types';
import {
    ArrowLeft,
    Plus,
    Search,
    LayoutGrid,
    MoreVertical,
    ChevronDown,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '../lib/utils';
import { DistroAvatar } from './DistroAvatar';

interface SelectHostPanelProps {
    hosts: Host[];
    customGroups?: string[];
    selectedHostId?: string;
    onSelect: (host: Host) => void;
    onBack: () => void;
    onNewHost?: () => void;
    title?: string;
    subtitle?: string;
}

const SelectHostPanel: React.FC<SelectHostPanelProps> = ({
    hosts,
    customGroups = [],
    selectedHostId,
    onSelect,
    onBack,
    onNewHost,
    title = 'Select Host',
    subtitle = 'Personal vault',
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPath, setCurrentPath] = useState<string | null>(null);

    // Get unique group paths from both hosts and customGroups
    const allGroupPaths = useMemo(() => {
        const pathSet = new Set<string>();
        hosts.forEach(h => {
            if (h.group) {
                // Add all parent paths as well
                const parts = h.group.split('/');
                for (let i = 1; i <= parts.length; i++) {
                    pathSet.add(parts.slice(0, i).join('/'));
                }
            }
        });
        customGroups.forEach(g => pathSet.add(g));
        return Array.from(pathSet).sort();
    }, [hosts, customGroups]);

    // Get groups at current level
    const groupsWithCounts = useMemo(() => {
        const prefix = currentPath ? `${currentPath}/` : '';
        const groups: { path: string; name: string; count: number }[] = [];
        const seen = new Set<string>();

        allGroupPaths.forEach(path => {
            if (currentPath === null) {
                // Root level - get top-level groups
                const topLevel = path.split('/')[0];
                if (!seen.has(topLevel)) {
                    seen.add(topLevel);
                    const count = hosts.filter(h => h.group && (h.group === topLevel || h.group.startsWith(`${topLevel}/`))).length;
                    groups.push({ path: topLevel, name: topLevel, count });
                }
            } else if (path.startsWith(prefix) && path !== currentPath) {
                // Subgroups
                const rest = path.slice(prefix.length);
                const nextLevel = rest.split('/')[0];
                const fullPath = `${prefix}${nextLevel}`;
                if (!seen.has(fullPath)) {
                    seen.add(fullPath);
                    const count = hosts.filter(h => h.group && (h.group === fullPath || h.group.startsWith(`${fullPath}/`))).length;
                    groups.push({ path: fullPath, name: nextLevel, count });
                }
            }
        });

        return groups;
    }, [allGroupPaths, currentPath, hosts]);

    // Get hosts at current level
    const filteredHosts = useMemo(() => {
        let result = hosts;

        // Filter by current path
        if (currentPath) {
            result = result.filter(h => h.group === currentPath || h.group?.startsWith(`${currentPath}/`));
        }

        // Filter by search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(h =>
                h.label.toLowerCase().includes(q) ||
                h.hostname.toLowerCase().includes(q) ||
                h.username.toLowerCase().includes(q)
            );
        }

        return result;
    }, [hosts, currentPath, searchQuery]);

    const handleBack = () => {
        if (currentPath) {
            const parts = currentPath.split('/');
            if (parts.length > 1) {
                setCurrentPath(parts.slice(0, -1).join('/'));
            } else {
                setCurrentPath(null);
            }
        } else {
            onBack();
        }
    };

    return (
        <div className="absolute inset-0 bg-secondary/95 backdrop-blur z-40 flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border/60 flex items-center gap-3">
                <button
                    onClick={handleBack}
                    className="p-1 hover:bg-secondary rounded-md transition-colors"
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="text-xs text-muted-foreground">{currentPath || subtitle}</p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="px-4 py-3 flex items-center gap-2 border-b border-border/60">
                {onNewHost && (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => {
                            onBack();
                            onNewHost();
                        }}
                    >
                        <Plus size={14} />
                        NEW HOST
                    </Button>
                )}
                <div className="relative flex-1 max-w-xs">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search"
                        className="h-8 pl-8"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
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
                                        onClick={() => setCurrentPath(group.path)}
                                    >
                                        <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                                            <LayoutGrid size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium">{group.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {group.count} Host{group.count !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Hosts Section */}
                    {filteredHosts.length > 0 && (
                        <div>
                            <h4 className="text-sm font-semibold mb-3">Hosts</h4>
                            <div className="space-y-1">
                                {filteredHosts.map(host => {
                                    const isSelected = selectedHostId === host.id;

                                    return (
                                        <div
                                            key={host.id}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                                                isSelected
                                                    ? "bg-primary/15 border border-primary/30"
                                                    : "hover:bg-secondary"
                                            )}
                                            onClick={() => onSelect(host)}
                                        >
                                            <DistroAvatar host={host} fallback={host.os[0].toUpperCase()} className="h-10 w-10" />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium">{host.label}</div>
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {host.protocol || 'ssh'}, {host.username}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Empty state */}
                    {groupsWithCounts.length === 0 && filteredHosts.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                            <p>No hosts found</p>
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border/60">
                <Button
                    className="w-full"
                    disabled={!selectedHostId}
                    onClick={() => {
                        const host = hosts.find(h => h.id === selectedHostId);
                        if (host) {
                            onSelect(host);
                        }
                    }}
                >
                    Continue
                </Button>
            </div>
        </div>
    );
};

export default SelectHostPanel;
