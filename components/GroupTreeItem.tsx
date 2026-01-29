import { ChevronRight,Folder,FolderOpen,FolderPlus,Plus } from 'lucide-react';
import React,{ useMemo } from 'react';
import { useI18n } from '../application/i18n/I18nProvider';
import { cn } from '../lib/utils';
import { GroupNode } from '../types';
import { Collapsible,CollapsibleContent,CollapsibleTrigger } from './ui/collapsible';
import { ContextMenu,ContextMenuContent,ContextMenuItem,ContextMenuTrigger } from './ui/context-menu';

interface GroupTreeItemProps {
  node: GroupNode;
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  onSelectGroup: (path: string) => void;
  selectedGroup: string | null;
  onEditGroup: (path: string) => void;
  onNewHost: (path: string) => void;
  onNewSubfolder: (path: string) => void;
  isManagedGroup?: (path: string) => boolean;
}

export const GroupTreeItem: React.FC<GroupTreeItemProps> = ({
  node,
  depth,
  expandedPaths,
  onToggle,
  onSelectGroup,
  selectedGroup,
  onEditGroup,
  onNewHost,
  onNewSubfolder,
}) => {
  const { t } = useI18n();
  const isExpanded = expandedPaths.has(node.path);
  const hasChildren = node.children && Object.keys(node.children).length > 0;
  const paddingLeft = `${depth * 12 + 12}px`;
  const isSelected = selectedGroup === node.path;

  const childNodes = useMemo(() => {
    return node.children
      ? (Object.values(node.children) as unknown as GroupNode[]).sort((a, b) => a.name.localeCompare(b.name))
      : [];
  }, [node.children]);

  return (
    <Collapsible open={isExpanded} onOpenChange={() => onToggle(node.path)}>
      <ContextMenu>
        <ContextMenuTrigger>
          <CollapsibleTrigger asChild>
            <div
              className={cn(
                "flex items-center py-1.5 pr-2 text-sm font-medium cursor-pointer transition-colors select-none group relative rounded-r-md",
                isSelected ? "bg-primary/10 text-primary border-l-2 border-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
              style={{ paddingLeft }}
              onClick={() => onSelectGroup(node.path)}
            >
              <div className="mr-1.5 flex-shrink-0 w-4 h-4 flex items-center justify-center">
                {hasChildren && (
                  <div className={cn("transition-transform duration-200", isExpanded ? "rotate-90" : "")}>
                    <ChevronRight size={12} />
                  </div>
                )}
              </div>
              <div className="mr-2 text-primary/80 group-hover:text-primary transition-colors">
                {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
              </div>
              <span className="truncate flex-1">{node.name}</span>
              {node.hosts.length > 0 && (
                <span className="text-[10px] opacity-70 bg-background/50 px-1.5 rounded-full border border-border">
                  {node.hosts.length}
                </span>
              )}
            </div>
          </CollapsibleTrigger>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onNewHost(node.path)}>
            <Plus className="mr-2 h-4 w-4" /> {t("action.newHost")}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onNewSubfolder(node.path)}>
            <FolderPlus className="mr-2 h-4 w-4" /> {t("action.newSubfolder")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {hasChildren && (
        <CollapsibleContent>
          {childNodes.map((child) => (
            <GroupTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onSelectGroup={onSelectGroup}
              selectedGroup={selectedGroup}
              onEditGroup={onEditGroup}
              onNewHost={onNewHost}
              onNewSubfolder={onNewSubfolder}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};
