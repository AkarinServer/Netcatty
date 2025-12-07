import React, { useMemo, useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { cn } from '../lib/utils';
import { Host, RemoteFile } from '../types';
import { DistroAvatar } from './DistroAvatar';
import { FileCode, Folder, HardDrive, Monitor, Plus, X } from 'lucide-react';

type FileItem = RemoteFile & { kind?: string };
type SftpPaneTab = { id: string; label: string; isLocal: boolean; hostId?: string; path: string; filter: string; status?: 'idle' | 'connecting' | 'connected' };
type Breadcrumb = { label: string; path: string };

const LOCAL_FILE_MAP: Record<string, FileItem[]> = {
  "/": [
    { name: "Applications", type: "directory", size: "--", lastModified: "--", kind: "folder" },
    { name: "Users", type: "directory", size: "--", lastModified: "--", kind: "folder" },
  ],
  "/Users": [
    { name: "chenqi", type: "directory", size: "--", lastModified: "Dec 27, 2025 9:10 AM", kind: "folder" },
  ],
  "/Users/chenqi": [
    { name: "Documents", type: "directory", size: "--", lastModified: "Dec 12, 2025 10:18 AM", kind: "folder" },
    { name: "Downloads", type: "directory", size: "--", lastModified: "Dec 17, 2025 3:40 AM", kind: "folder" },
    { name: "Pictures", type: "directory", size: "--", lastModified: "Jul 19, 2025 10:52 PM", kind: "folder" },
    { name: "Projects", type: "directory", size: "--", lastModified: "Dec 3, 2025 2:22 PM", kind: "folder" },
    { name: "notes.txt", type: "file", size: "3.2 KB", lastModified: "Nov 2, 2025 9:12 PM", kind: "txt" },
  ],
  "/Users/chenqi/Downloads": [
    { name: "archive.zip", type: "file", size: "128 MB", lastModified: "Dec 2, 2025 11:12 PM", kind: "zip" },
    { name: "release", type: "directory", size: "--", lastModified: "Dec 1, 2025 5:00 PM", kind: "folder" },
  ],
  "/Users/chenqi/Projects": [
    { name: "nebula-ssh", type: "directory", size: "--", lastModified: "Dec 27, 2025 9:10 AM", kind: "folder" },
    { name: "readme.md", type: "file", size: "7.2 KB", lastModified: "Nov 4, 2025 8:12 AM", kind: "md" },
  ],
  "/Users/chenqi/Projects/nebula-ssh": [
    { name: "src", type: "directory", size: "--", lastModified: "Dec 18, 2025 12:12 PM", kind: "folder" },
    { name: "package.json", type: "file", size: "2.4 KB", lastModified: "Dec 18, 2025 12:12 PM", kind: "json" },
    { name: "README.md", type: "file", size: "4.1 KB", lastModified: "Nov 30, 2025 9:40 AM", kind: "md" },
  ],
};

const REMOTE_FILE_MAP: Record<string, FileItem[]> = {
  "/": [
    { name: "root", type: "directory", size: "--", lastModified: "--", kind: "folder" },
    { name: "var", type: "directory", size: "--", lastModified: "--", kind: "folder" },
    { name: "etc", type: "directory", size: "--", lastModified: "--", kind: "folder" },
    { name: "opt", type: "directory", size: "--", lastModified: "--", kind: "folder" },
  ],
  "/root": [
    { name: "deploy.sh", type: "file", size: "21.3 KB", lastModified: "Sep 28, 2025 3:42 PM", kind: "sh" },
    { name: "clean.sh", type: "file", size: "1.6 KB", lastModified: "Sep 28, 2025 3:46 PM", kind: "sh" },
    { name: "update.sh", type: "file", size: "498 Bytes", lastModified: "Nov 17, 2025 10:20 PM", kind: "sh" },
    { name: "notes", type: "directory", size: "--", lastModified: "Sep 15, 2025 10:20 PM", kind: "folder" },
  ],
  "/root/notes": [
    { name: "todo.md", type: "file", size: "1.2 KB", lastModified: "Sep 10, 2025 8:11 PM", kind: "md" },
    { name: "deploy-checklist.md", type: "file", size: "2.4 KB", lastModified: "Sep 9, 2025 6:05 PM", kind: "md" },
  ],
  "/var": [
    { name: "log", type: "directory", size: "--", lastModified: "Aug 1, 2025 12:00 PM", kind: "folder" },
    { name: "www", type: "directory", size: "--", lastModified: "Jul 1, 2025 7:32 PM", kind: "folder" },
  ],
  "/var/log": [
    { name: "syslog", type: "file", size: "14.2 MB", lastModified: "Dec 17, 2025 7:11 PM", kind: "log" },
    { name: "kern.log", type: "file", size: "2.9 MB", lastModified: "Dec 17, 2025 7:07 PM", kind: "log" },
  ],
  "/etc": [
    { name: "nginx", type: "directory", size: "--", lastModified: "Nov 1, 2025 4:20 PM", kind: "folder" },
    { name: "ssh", type: "directory", size: "--", lastModified: "Oct 12, 2025 11:20 AM", kind: "folder" },
    { name: "timezone", type: "file", size: "122 Bytes", lastModified: "Oct 2, 2025 9:02 AM", kind: "conf" },
  ],
  "/etc/nginx": [
    { name: "nginx.conf", type: "file", size: "3.4 KB", lastModified: "Nov 1, 2025 4:20 PM", kind: "conf" },
    { name: "sites-enabled", type: "directory", size: "--", lastModified: "Nov 1, 2025 4:20 PM", kind: "folder" },
  ],
  "/etc/ssh": [
    { name: "sshd_config", type: "file", size: "2.1 KB", lastModified: "Oct 12, 2025 11:21 AM", kind: "conf" },
    { name: "ssh_config", type: "file", size: "1.1 KB", lastModified: "Oct 12, 2025 11:19 AM", kind: "conf" },
  ],
};

const breadcrumbForPath = (path: string): Breadcrumb[] => {
  if (path === '/') return [];
  const parts = path.split('/').filter(Boolean);
  return parts.map((part, idx) => ({
    label: part,
    path: '/' + parts.slice(0, idx + 1).join('/'),
  }));
};

const parentForPath = (path: string) => {
  if (path === '/') return '/';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
};

const applyFileFilter = (items: FileItem[], filter: string) => {
  const term = filter.trim().toLowerCase();
  if (!term) return items;
  return items.filter(item => item.name === '..' || item.name.toLowerCase().includes(term));
};

const getEntriesForTab = (tab: SftpPaneTab | null) => {
  if (!tab) return [];
  const map: Record<string, FileItem[]> = tab.isLocal ? LOCAL_FILE_MAP : REMOTE_FILE_MAP;
  const files: FileItem[] = map[tab.path] || [];
  const parentEntry: FileItem = { name: '..', type: 'directory', size: '--', lastModified: '--', kind: 'folder' };
  const withParent = tab.path === '/' ? files : [parentEntry, ...files];
  return applyFileFilter(withParent, tab.filter);
};

const formatKind = (item: FileItem) => {
  if (item.type === 'directory') return 'folder';
  if (item.kind) return item.kind;
  const ext = item.name.split('.').pop();
  return ext ? ext.toLowerCase() : 'file';
};

interface SftpViewProps {
  hosts: Host[];
  isActive: boolean;
}

export const SftpView: React.FC<SftpViewProps> = ({ hosts, isActive }) => {
  const [sftpLeftTab, setSftpLeftTab] = useState<SftpPaneTab>({ id: 'local-default', label: 'Local', isLocal: true, hostId: 'local', path: '/Users/chenqi', filter: '' });
  const [sftpRightTab, setSftpRightTab] = useState<SftpPaneTab | null>(null);
  const [sftpHostModalSide, setSftpHostModalSide] = useState<'left' | 'right' | null>(null);
  const [sftpHostPickerSearch, setSftpHostPickerSearch] = useState('');

  const filteredSftpHosts = useMemo(() => {
    const term = sftpHostPickerSearch.trim().toLowerCase();
    return hosts
      .filter(h => {
        if (!term) return true;
        return (
          h.label.toLowerCase().includes(term) ||
          h.hostname.toLowerCase().includes(term) ||
          (h.group || '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [hosts, sftpHostPickerSearch]);

  const leftEntries = useMemo(() => getEntriesForTab(sftpLeftTab), [sftpLeftTab]);
  const rightEntries = useMemo(() => getEntriesForTab(sftpRightTab), [sftpRightTab]);
  const leftBreadcrumbs = useMemo(() => breadcrumbForPath(sftpLeftTab?.path || '/'), [sftpLeftTab]);
  const rightBreadcrumbs = useMemo(() => breadcrumbForPath(sftpRightTab?.path || '/'), [sftpRightTab]);

  const updateTabField = (side: 'left' | 'right', updater: (tab: SftpPaneTab) => Partial<SftpPaneTab>) => {
    if (side === 'left') setSftpLeftTab(prev => ({ ...prev, ...updater(prev) }));
    else setSftpRightTab(prev => prev ? ({ ...prev, ...updater(prev) }) : prev);
  };

  const openEntry = (side: 'left' | 'right', tab: SftpPaneTab | null, item: FileItem) => {
    if (!tab || item.type !== 'directory') return;
    if (item.name === '..') {
      const parent = parentForPath(tab.path);
      updateTabField(side, () => ({ path: parent }));
      return;
    }
    const next = tab.path === '/' ? `/${item.name}` : `${tab.path}/${item.name}`;
    updateTabField(side, () => ({ path: next }));
  };

  const selectHostForSide = (side: 'left' | 'right', host: Host | 'local') => {
    if (host === 'local') {
      const tab = { id: `tab-${side}-${crypto.randomUUID()}`, label: 'Local', isLocal: true, hostId: 'local', path: '/Users/chenqi', filter: '', status: 'connected' } as SftpPaneTab;
      side === 'left' ? setSftpLeftTab(tab) : setSftpRightTab(tab);
    } else {
      const tab = { id: `tab-${side}-${crypto.randomUUID()}`, label: host.label, isLocal: false, hostId: host.id, path: '/root', filter: '', status: 'connected' } as SftpPaneTab;
      side === 'left' ? setSftpLeftTab(tab) : setSftpRightTab(tab);
    }
    setSftpHostModalSide(null);
    setSftpHostPickerSearch('');
  };

  return (
    <div
      className="absolute inset-0 min-h-0 flex z-20"
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      <div className="flex-1 flex flex-col min-h-0 bg-background">
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 min-h-0 border-t border-border/70">
          {/* Left pane */}
          <div className="flex flex-col min-h-0 border-r border-border/70">
            <div className="h-12 px-4 border-b border-border/60 flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Monitor size={14} />
                <span>{sftpLeftTab?.label || 'Local / Hosts'}</span>
              </div>
              <Button variant="outline" size="sm" className="h-9 px-3" onClick={() => setSftpHostModalSide('left')}>
                <Plus size={14} className="mr-2" /> Change host
              </Button>
              {sftpLeftTab && (
                <div className="flex items-center gap-2 ml-auto">
                  <Input
                    value={sftpLeftTab.filter}
                    onChange={(e) => updateTabField('left', () => ({ filter: e.target.value }))}
                    placeholder="Filter"
                    className="h-9 w-44 bg-background/60"
                  />
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={() => updateTabField('left', () => ({ filter: '' }))}>
                    <X size={14} />
                  </Button>
                </div>
              )}
            </div>

            <div className="px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <span className="opacity-60">/</span>
              {leftBreadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.path}>
                  <button
                    className={cn("hover:text-foreground", sftpLeftTab?.path === crumb.path && "text-foreground font-semibold")}
                    onClick={() => sftpLeftTab && updateTabField('left', () => ({ path: crumb.path }))}
                  >
                    {crumb.label}
                  </button>
                  {idx < leftBreadcrumbs.length - 1 && <span className="opacity-60">/</span>}
                </React.Fragment>
              ))}
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="grid grid-cols-[minmax(0,1fr)_160px_100px_100px] text-[11px] uppercase tracking-wide text-muted-foreground px-4 py-2 border-y border-border/70">
                <span>Name</span>
                <span>Date Modified</span>
                <span>Size</span>
                <span>Kind</span>
              </div>
              <div className="flex-1 overflow-auto divide-y divide-border/60">
                {leftEntries.map((file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    className="grid grid-cols-[minmax(0,1fr)_160px_100px_100px] px-4 py-2 items-center hover:bg-primary/5 cursor-pointer text-sm"
                    onClick={() => openEntry('left', sftpLeftTab, file)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("h-8 w-8 rounded-md flex items-center justify-center border border-border/60", file.type === 'directory' ? "bg-primary/10 text-primary" : "bg-secondary/60 text-muted-foreground")}>
                        {file.type === 'directory' ? <Folder size={14} /> : <FileCode size={14} />}
                      </div>
                      <span className="truncate">{file.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground truncate">{file.lastModified}</span>
                    <span className="text-xs text-muted-foreground truncate">{file.size}</span>
                    <span className="text-xs text-muted-foreground truncate capitalize">{formatKind(file)}</span>
                  </div>
                ))}
              </div>
              <div className="h-10 px-4 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/70">
                <span>{leftEntries.length} items</span>
                <span>{sftpLeftTab?.path}</span>
              </div>
            </div>
          </div>

          {/* Right pane */}
          <div className="flex flex-col min-h-0">
            <div className="h-12 px-4 border-b border-border/60 flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <HardDrive size={14} />
                <span>{sftpRightTab?.label || 'Remote'}</span>
              </div>
              <Button variant="outline" size="sm" className="h-9 px-3" onClick={() => setSftpHostModalSide('right')}>
                <Plus size={14} className="mr-2" /> Change host
              </Button>
              {sftpRightTab && (
                <div className="flex items-center gap-2 ml-auto">
                  <Input
                    value={sftpRightTab.filter}
                    onChange={(e) => updateTabField('right', () => ({ filter: e.target.value }))}
                    placeholder="Filter remote"
                    className="h-9 w-44 bg-background/60"
                  />
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={() => updateTabField('right', () => ({ filter: '' }))}>
                    <X size={14} />
                  </Button>
                </div>
              )}
            </div>

            {sftpRightTab ? (
              <>
                <div className="px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
                  <span className="opacity-60">/</span>
                  {rightBreadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={crumb.path}>
                      <button
                        className={cn("hover:text-foreground", sftpRightTab.path === crumb.path && "text-foreground font-semibold")}
                        onClick={() => updateTabField('right', () => ({ path: crumb.path }))}
                      >
                        {crumb.label}
                      </button>
                      {idx < rightBreadcrumbs.length - 1 && <span className="opacity-60">/</span>}
                    </React.Fragment>
                  ))}
                </div>
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_160px_100px_100px] text-[11px] uppercase tracking-wide text-muted-foreground px-4 py-2 border-y border-border/70">
                    <span>Name</span>
                    <span>Date Modified</span>
                    <span>Size</span>
                    <span>Kind</span>
                  </div>
                  <div className="flex-1 overflow-auto divide-y divide-border/60 relative">
                    {rightEntries.map((file, idx) => (
                      <div
                        key={`${file.name}-${idx}`}
                        className="grid grid-cols-[minmax(0,1fr)_160px_100px_100px] px-4 py-2 items-center hover:bg-primary/5 cursor-pointer text-sm"
                        onClick={() => openEntry('right', sftpRightTab, file)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn("h-8 w-8 rounded-md flex items-center justify-center border border-border/60", file.type === 'directory' ? "bg-primary/10 text-primary" : "bg-secondary/60 text-muted-foreground")}>
                            {file.type === 'directory' ? <Folder size={14} /> : <FileCode size={14} />}
                          </div>
                          <span className="truncate">{file.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{file.lastModified}</span>
                        <span className="text-xs text-muted-foreground truncate">{file.size}</span>
                        <span className="text-xs text-muted-foreground truncate capitalize">{formatKind(file)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="h-10 px-4 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/70">
                    <span>{rightEntries.length} items</span>
                    <span>{sftpRightTab?.hostId || 'No host'}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-secondary/60 text-primary flex items-center justify-center">
                  <Folder size={20} />
                </div>
                <div className="text-sm font-semibold">Select a host to start</div>
                <div className="text-xs text-muted-foreground">Use “Add host” to open a remote in this pane.</div>
                <Button onClick={() => setSftpHostModalSide('right')}>Add host</Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!sftpHostModalSide} onOpenChange={(open) => setSftpHostModalSide(open ? (sftpHostModalSide || 'left') : null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Host</DialogTitle>
            <DialogDescription>Pick a host for the {sftpHostModalSide === 'left' ? 'left' : 'right'} pane.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={sftpHostPickerSearch}
              onChange={(e) => setSftpHostPickerSearch(e.target.value)}
              placeholder="Search hosts"
              className="h-10"
            />
            <div
              className="flex items-center justify-between px-3 py-2 rounded-md border border-border/70 bg-secondary/50 cursor-pointer hover:border-primary/60"
              onClick={() => selectHostForSide(sftpHostModalSide || 'left', 'local')}
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-primary/10 border border-primary/50 flex items-center justify-center text-primary font-semibold">L</div>
                <div>
                  <div className="text-sm font-semibold">Local filesystem</div>
                  <div className="text-xs text-muted-foreground">/Users/chenqi</div>
                </div>
              </div>
              <Badge variant="outline">Local</Badge>
            </div>
            <div className="max-h-72 overflow-auto space-y-2 pr-1">
              {filteredSftpHosts.map(host => (
                <div
                  key={host.id}
                  className="flex items-center justify-between px-3 py-2 rounded-md border border-border/70 bg-secondary/50 cursor-pointer hover:border-primary/60"
                  onClick={() => selectHostForSide(sftpHostModalSide || 'left', host)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <DistroAvatar host={host} fallback={(host.os || 'L')[0].toUpperCase()} className="h-9 w-9" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{host.label}</div>
                      <div className="text-xs text-muted-foreground truncate">{host.username}@{host.hostname}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{host.group || 'Personal'}</div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">Host</Badge>
                </div>
              ))}
              {filteredSftpHosts.length === 0 && (
                <div className="text-xs text-muted-foreground px-3 py-6 text-center border border-dashed border-border/70 rounded-md">
                  No matching hosts
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
