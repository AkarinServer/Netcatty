import React, { useMemo, useState, memo } from 'react';
import {
  Activity,
  BookMarked,
  ChevronRight,
  Command,
  FolderPlus,
  Edit2,
  FileCode,
  Grid,
  Heart,
  Key,
  LayoutGrid,
  Plug,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  TerminalSquare,
} from 'lucide-react';
import { Host, SSHKey, Snippet, GroupNode, TerminalSession } from '../types';
import { DistroAvatar } from './DistroAvatar';
import SnippetsManager from './SnippetsManager';
import KeyManager from './KeyManager';
import PortForwarding from './PortForwardingNew';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Label } from './ui/label';
import { sanitizeHost } from '../domain/host';
import { useIsVaultActive } from '../application/state/activeTabStore';

type VaultSection = 'hosts' | 'keys' | 'snippets' | 'port';

// Props without isActive - it's now subscribed internally
interface VaultViewProps {
  hosts: Host[];
  keys: SSHKey[];
  snippets: Snippet[];
  snippetPackages: string[];
  customGroups: string[];
  sessions: TerminalSession[];
  showAssistant: boolean;
  onToggleAssistant: () => void;
  onOpenSettings: () => void;
  onOpenQuickSwitcher: () => void;
  onNewHost: () => void;
  onCreateLocalTerminal: () => void;
  onEditHost: (host: Host) => void;
  onDeleteHost: (id: string) => void;
  onConnect: (host: Host) => void;
  onUpdateHosts: (hosts: Host[]) => void;
  onUpdateKeys: (keys: SSHKey[]) => void;
  onUpdateSnippets: (snippets: Snippet[]) => void;
  onUpdateSnippetPackages: (pkgs: string[]) => void;
  onUpdateCustomGroups: (groups: string[]) => void;
}

const VaultViewInner: React.FC<VaultViewProps> = ({
  hosts,
  keys,
  snippets,
  snippetPackages,
  customGroups,
  sessions,
  showAssistant,
  onToggleAssistant,
  onOpenSettings,
  onOpenQuickSwitcher,
  onNewHost,
  onCreateLocalTerminal,
  onEditHost,
  onDeleteHost,
  onConnect,
  onUpdateHosts,
  onUpdateKeys,
  onUpdateSnippets,
  onUpdateSnippetPackages,
  onUpdateCustomGroups,
}) => {
  // Subscribe to isActive from external store - only re-renders when vault active state changes
  const isActive = useIsVaultActive();
  const [currentSection, setCurrentSection] = useState<VaultSection>('hosts');
  const [search, setSearch] = useState('');
  const [selectedGroupPath, setSelectedGroupPath] = useState<string | null>(null);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [targetParentPath, setTargetParentPath] = useState<string | null>(null);

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

  const findGroupNode = (path: string | null): GroupNode | null => {
    if (!path) return { name: 'root', path: '', children: buildGroupTree, hosts: [] } as any;
    const parts = path.split('/').filter(Boolean);
    let current: any = { children: buildGroupTree };
    for (const p of parts) {
      current = current.children?.[p];
      if (!current) return null;
    }
    return current;
  };

  const displayedHosts = useMemo(() => {
    let filtered = hosts;
    if (selectedGroupPath) {
      filtered = filtered.filter(h => (h.group || '') === selectedGroupPath);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      filtered = filtered.filter(h =>
        h.label.toLowerCase().includes(s) ||
        h.hostname.toLowerCase().includes(s) ||
        h.tags.some(t => t.toLowerCase().includes(s))
      );
    }
    return filtered;
  }, [hosts, selectedGroupPath, search]);

  const displayedGroups = useMemo(() => {
    if (!selectedGroupPath) {
      return (Object.values(buildGroupTree) as GroupNode[]).sort((a, b) => a.name.localeCompare(b.name));
    }
    const node = findGroupNode(selectedGroupPath);
    if (!node || !node.children) return [];
    return (Object.values(node.children) as GroupNode[]).sort((a, b) => a.name.localeCompare(b.name));
  }, [buildGroupTree, selectedGroupPath]);

  const submitNewFolder = () => {
    if (!newFolderName.trim()) return;
    const fullPath = targetParentPath ? `${targetParentPath}/${newFolderName.trim()}` : newFolderName.trim();
    onUpdateCustomGroups(Array.from(new Set([...customGroups, fullPath])));
    setIsNewFolderOpen(false);
  };

  const deleteGroupPath = (path: string) => {
    const keepGroups = customGroups.filter(g => !(g === path || g.startsWith(path + '/')));
    const keepHosts = hosts.map(h => {
      const g = h.group || '';
      if (g === path || g.startsWith(path + '/')) return { ...h, group: '' };
      return h;
    });
    onUpdateCustomGroups(keepGroups);
    onUpdateHosts(keepHosts);
    if (selectedGroupPath && (selectedGroupPath === path || selectedGroupPath.startsWith(path + '/'))) {
      setSelectedGroupPath(null);
    }
  };

  const moveGroup = (sourcePath: string, targetParent: string | null) => {
    const name = sourcePath.split('/').filter(Boolean).pop() || '';
    const newPath = targetParent ? `${targetParent}/${name}` : name;
    if (newPath === sourcePath || newPath.startsWith(sourcePath + '/')) return;
    const updatedGroups = customGroups.map(g => {
      if (g === sourcePath) return newPath;
      if (g.startsWith(sourcePath + '/')) return g.replace(sourcePath, newPath);
      return g;
    });
    const updatedHosts = hosts.map(h => {
      const g = h.group || '';
      if (g === sourcePath) return { ...h, group: newPath };
      if (g.startsWith(sourcePath + '/')) return { ...h, group: g.replace(sourcePath, newPath) };
      return h;
    });
    onUpdateCustomGroups(Array.from(new Set(updatedGroups)));
    onUpdateHosts(updatedHosts);
    if (selectedGroupPath && (selectedGroupPath === sourcePath || selectedGroupPath.startsWith(sourcePath + '/'))) {
      setSelectedGroupPath(newPath);
    }
  };

  const moveHostToGroup = (hostId: string, groupPath: string | null) => {
    onUpdateHosts(hosts.map(h => h.id === hostId ? { ...h, group: groupPath || '' } : h));
  };

  // Use visibility + pointer-events instead of display:none to preserve component state
  // and avoid re-rendering when switching tabs
  // When inactive, also set z-index to -1 to prevent rendering artifacts
  const containerStyle: React.CSSProperties = isActive
    ? {}
    : { visibility: 'hidden', pointerEvents: 'none', position: 'absolute', zIndex: -1 };

  return (
    <div
      className={cn("absolute inset-0 min-h-0 flex", isActive ? "z-20" : "")}
      style={containerStyle}
    >
      {/* Sidebar */}
      <div className="w-64 bg-secondary/80 border-r border-border/60 flex flex-col">
        <div className="px-4 py-4 flex items-center gap-3">
          <img src="/logo.svg" alt="netcatty logo" className="h-10 w-10 rounded-xl bg-transparent" />
          <div>
            <p className="text-sm font-bold text-foreground">Netcatty</p>
          </div>
        </div>

        <div className="px-3 space-y-1">
          <Button variant={currentSection === 'hosts' ? 'secondary' : 'ghost'} className="w-full justify-start gap-3 h-10" onClick={() => { setCurrentSection('hosts'); setSelectedGroupPath(null); }}>
            <LayoutGrid size={16} /> Hosts
          </Button>
          <Button variant={currentSection === 'keys' ? 'secondary' : 'ghost'} className="w-full justify-start gap-3 h-10" onClick={() => { setCurrentSection('keys'); }}>
            <Key size={16} /> Keychain
          </Button>
          <Button variant={currentSection === 'port' ? 'secondary' : 'ghost'} className="w-full justify-start gap-3 h-10" onClick={() => setCurrentSection('port')}>
            <Plug size={16} /> Port Forwarding
          </Button>
          <Button variant={currentSection === 'snippets' ? 'secondary' : 'ghost'} className="w-full justify-start gap-3 h-10" onClick={() => { setCurrentSection('snippets'); }}>
            <FileCode size={16} /> Snippets
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3 h-10">
            <BookMarked size={16} /> Known Hosts
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3 h-10">
            <Activity size={16} /> Logs
          </Button>
        </div>

        <div className="mt-auto px-3 pb-4 space-y-2">
          <Button variant={showAssistant ? "secondary" : "ghost"} className="w-full justify-start gap-3" onClick={onToggleAssistant}>
            <Command size={16} /> AI Assistant
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={onOpenSettings}>
            <Settings size={16} /> Settings
          </Button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {currentSection === 'hosts' && (
          <header className="border-b border-border/50 bg-secondary/80 backdrop-blur">
            <div className="h-14 px-4 py-2 flex items-center gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Find a host or ssh user@hostname..." className="pl-9 h-11 bg-secondary border-border/60 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Button variant="secondary" className="h-11 px-4" onClick={onOpenQuickSwitcher}>Connect</Button>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground"><LayoutGrid size={16} /></Button>
                <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground"><Grid size={16} /></Button>
                <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground"><Heart size={16} /></Button>
                <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground"><Star size={16} /></Button>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-11 px-3" onClick={onNewHost}>
                  <Plus size={14} className="mr-2" /> New Host
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-11 w-10 px-0">
                      <ChevronRight size={16} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-2"
                      onClick={() => { setTargetParentPath(selectedGroupPath); setIsNewFolderOpen(true); }}
                    >
                      <Grid size={14} /> New Group
                    </Button>
                  </PopoverContent>
                </Popover>
                <Button size="sm" variant="secondary" className="h-11 px-3" onClick={onCreateLocalTerminal}>
                  <TerminalSquare size={14} className="mr-2" /> Terminal
                </Button>
              </div>
            </div>
          </header>
        )}

        {currentSection !== 'port' && (
          <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
            {currentSection === 'hosts' && (
              <>
                <section className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <button className="text-primary hover:underline" onClick={() => setSelectedGroupPath(null)}>All hosts</button>
                    {selectedGroupPath && selectedGroupPath.split('/').filter(Boolean).map((part, idx, arr) => {
                      const crumbPath = arr.slice(0, idx + 1).join('/');
                      const isLast = idx === arr.length - 1;
                      return (
                        <span key={crumbPath} className="flex items-center gap-2">
                          <span className="text-muted-foreground">›</span>
                          <button className={cn(isLast ? "text-foreground font-semibold" : "text-primary hover:underline")} onClick={() => setSelectedGroupPath(crumbPath)}>
                            {part}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  {displayedGroups.length > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground">Groups</h3>
                        <div className="text-xs text-muted-foreground">{displayedGroups.length} total</div>
                      </div>
                    </>
                  )}
                  <div className={cn("grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", displayedGroups.length === 0 ? "hidden" : "")}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const hostId = e.dataTransfer.getData('host-id');
                      const groupPath = e.dataTransfer.getData('group-path');
                      if (hostId) moveHostToGroup(hostId, selectedGroupPath);
                      if (groupPath && selectedGroupPath !== null) moveGroup(groupPath, selectedGroupPath);
                    }}>
                    {displayedGroups.map(node => (
                      <ContextMenu key={node.path}>
                        <ContextMenuTrigger asChild>
                          <div
                            className="soft-card elevate rounded-lg p-4 cursor-pointer"
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData('group-path', node.path)}
                            onDoubleClick={() => setSelectedGroupPath(node.path)}
                            onClick={() => setSelectedGroupPath(node.path)}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const hostId = e.dataTransfer.getData('host-id');
                              const groupPath = e.dataTransfer.getData('group-path');
                              if (hostId) moveHostToGroup(hostId, node.path);
                              if (groupPath) moveGroup(groupPath, node.path);
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                                <Grid size={18} />
                              </div>
                              <div>
                                <div className="text-sm font-semibold">{node.name}</div>
                                <div className="text-[11px] text-muted-foreground">{node.hosts.length} Hosts</div>
                              </div>
                            </div>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => { setTargetParentPath(node.path); setIsNewFolderOpen(true); }}>
                            <FolderPlus className="mr-2 h-4 w-4" /> New Subgroup
                          </ContextMenuItem>
                          <ContextMenuItem className="text-destructive" onClick={() => deleteGroupPath(node.path)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Group
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-muted-foreground">Hosts</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{displayedHosts.length} entries</span>
                      <div className="bg-secondary/80 border border-border/70 rounded-md px-2 py-1 text-[11px]">{sessions.length} live</div>
                    </div>
                  </div>
                  <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {displayedHosts.map((host) => {
                      const safeHost = sanitizeHost(host);
                      const distroBadge = { text: (safeHost.os || 'L')[0].toUpperCase(), label: safeHost.distro || safeHost.os || 'Linux' };
                      return (
                        <ContextMenu key={host.id}>
                          <ContextMenuTrigger>
                            <div
                              className="soft-card elevate rounded-xl cursor-pointer h-[72px] px-3 py-2"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('host-id', host.id);
                              }}
                              onClick={() => onConnect(safeHost)}
                            >
                              <div className="flex items-center gap-3 h-full">
                                <DistroAvatar host={safeHost} fallback={distroBadge.text} />
                                <div className="min-w-0 flex flex-col justify-center gap-0.5">
                                  <div className="text-sm font-semibold truncate leading-5">{safeHost.label}</div>
                                  <div className="text-[11px] text-muted-foreground font-mono truncate leading-4">{safeHost.username}@{safeHost.hostname}</div>
                                  {safeHost.distro && <div className="text-[10px] text-muted-foreground truncate leading-4">{distroBadge.label}</div>}
                                </div>
                              </div>
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem onClick={() => onConnect(host)}>
                              <Plug className="mr-2 h-4 w-4" /> Connect
                            </ContextMenuItem>
                            <ContextMenuItem onClick={() => onEditHost(host)}>
                              <Edit2 className="mr-2 h-4 w-4" /> Edit
                            </ContextMenuItem>
                            <ContextMenuItem className="text-destructive" onClick={() => onDeleteHost(host.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      );
                    })}
                    {displayedHosts.length === 0 && (
                      <div className="col-span-full flex flex-col items-center justify-center py-24 text-muted-foreground">
                        <div className="h-16 w-16 rounded-2xl bg-secondary/80 flex items-center justify-center mb-4">
                          <LayoutGrid size={32} className="opacity-60" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground mb-2">Set up your hosts</h3>
                        <p className="text-sm text-center max-w-sm">
                          Save hosts to quickly connect to your servers, VMs, and containers.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}

            {currentSection === 'keys' && (
              <KeyManager keys={keys} onSave={k => onUpdateKeys([...keys, k])} onDelete={id => onUpdateKeys(keys.filter(k => k.id !== id))} />
            )}
            {currentSection === 'snippets' && (
              <SnippetsManager
                snippets={snippets}
                packages={snippetPackages}
                hosts={hosts}
                onPackagesChange={onUpdateSnippetPackages}
                onSave={s => onUpdateSnippets(snippets.find(ex => ex.id === s.id) ? snippets.map(ex => ex.id === s.id ? s : ex) : [...snippets, s])}
                onDelete={id => onUpdateSnippets(snippets.filter(s => s.id !== id))}
              />
            )}
          </div>
        )}
        {currentSection === 'port' && <PortForwarding hosts={hosts} keys={keys} customGroups={customGroups} onNewHost={onNewHost} />}
      </div>

      <Dialog open={isNewFolderOpen} onOpenChange={setIsNewFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{targetParentPath ? `Create Subfolder` : 'Create Root Group'}</DialogTitle>
            <DialogDescription className="sr-only">Create a new group for organizing hosts.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Group Name</Label>
            <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="e.g. Production" autoFocus onKeyDown={e => e.key === 'Enter' && submitNewFolder()} />
            {targetParentPath && <p className="text-xs text-muted-foreground mt-2">Parent: <span className="font-mono">{targetParentPath}</span></p>}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setIsNewFolderOpen(false)}>Cancel</Button><Button onClick={submitNewFolder}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Only re-render when data props change - isActive is now managed internally via store subscription
const vaultViewAreEqual = (prev: VaultViewProps, next: VaultViewProps): boolean => {
  return (
    prev.hosts === next.hosts &&
    prev.keys === next.keys &&
    prev.snippets === next.snippets &&
    prev.snippetPackages === next.snippetPackages &&
    prev.customGroups === next.customGroups &&
    prev.sessions === next.sessions &&
    prev.showAssistant === next.showAssistant
  );
};

export const VaultView = memo(VaultViewInner, vaultViewAreEqual);
VaultView.displayName = 'VaultView';
