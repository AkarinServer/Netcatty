/**
 * SFTP File row component for file list
 */

import { Folder, Link } from 'lucide-react';
import React,{ memo } from 'react';
import { cn } from '../../lib/utils';
import { SftpFileEntry } from '../../types';
import { ColumnWidths,formatBytes,formatDate,getFileIcon,isNavigableDirectory } from './utils';

interface SftpFileRowProps {
    entry: SftpFileEntry;
    isSelected: boolean;
    isDragOver: boolean;
    columnWidths: ColumnWidths;
    onSelect: (e: React.MouseEvent) => void;
    onOpen: () => void;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
}

const SftpFileRowInner: React.FC<SftpFileRowProps> = ({
    entry,
    isSelected,
    isDragOver,
    columnWidths,
    onSelect,
    onOpen,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
}) => {
    const isParentDir = entry.name === '..';
    // A symlink pointing to a directory behaves like a directory (navigable, accepts drops)
    const isNavDir = isNavigableDirectory(entry);
    const isSymlinkToDirectory = entry.type === 'symlink' && entry.linkTarget === 'directory';

    return (
        <div
            draggable={!isParentDir}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={onSelect}
            onDoubleClick={onOpen}
            className={cn(
                "px-4 py-2 items-center cursor-pointer text-sm transition-colors",
                isSelected ? "bg-primary/15 text-foreground" : "hover:bg-secondary/40",
                isDragOver && isNavDir && "bg-primary/25 ring-1 ring-primary/50"
            )}
            style={{ display: 'grid', gridTemplateColumns: `${columnWidths.name}% ${columnWidths.modified}% ${columnWidths.size}% ${columnWidths.type}%` }}
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className={cn(
                    "h-7 w-7 rounded flex items-center justify-center shrink-0 relative",
                    isNavDir ? "bg-primary/10 text-primary" : "bg-secondary/60 text-muted-foreground"
                )}>
                    {isNavDir ? <Folder size={14} /> : getFileIcon(entry)}
                    {/* Show link indicator for symlinks */}
                    {entry.type === 'symlink' && (
                        <Link size={8} className="absolute -bottom-0.5 -right-0.5 text-muted-foreground" aria-hidden="true" />
                    )}
                </div>
                <span className={cn("truncate", entry.type === 'symlink' && "italic")}>
                    {entry.name}
                    {entry.type === 'symlink' && <span className="sr-only"> (symbolic link)</span>}
                </span>
            </div>
            <span className="text-xs text-muted-foreground truncate">{formatDate(entry.lastModified)}</span>
            <span className="text-xs text-muted-foreground truncate text-right">
                {isNavDir ? '--' : formatBytes(entry.size)}
            </span>
            <span className="text-xs text-muted-foreground truncate capitalize text-right">
                {isSymlinkToDirectory ? 'link → folder' : entry.type === 'directory' ? 'folder' : entry.type === 'symlink' ? 'link' : entry.name.split('.').pop()?.toLowerCase() || 'file'}
            </span>
        </div>
    );
};

export const SftpFileRow = memo(SftpFileRowInner);
SftpFileRow.displayName = 'SftpFileRow';
