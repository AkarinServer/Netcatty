import React from 'react';
import { Check, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { ScrollArea } from './scroll-area';
import { cn } from '../../lib/utils';

interface TagFilterDropdownProps {
    allTags: string[];
    selectedTags: string[];
    onChange: (tags: string[]) => void;
    className?: string;
}

export const TagFilterDropdown: React.FC<TagFilterDropdownProps> = ({
    allTags,
    selectedTags,
    onChange,
    className,
}) => {
    const [open, setOpen] = React.useState(false);

    const toggleTag = (tag: string) => {
        if (selectedTags.includes(tag)) {
            onChange(selectedTags.filter(t => t !== tag));
        } else {
            onChange([...selectedTags, tag]);
        }
    };

    const clearAll = () => {
        onChange([]);
    };

    const hasFilters = selectedTags.length > 0;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className={cn(
                        className || "h-8 w-8",
                        hasFilters && "text-primary"
                    )}
                >
                    <Tag size={14} />
                    {open ? <ChevronUp size={10} className="ml-0.5" /> : <ChevronDown size={10} className="ml-0.5" />}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1 z-[60]" align="end">
                {allTags.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                        No tags available
                    </div>
                ) : (
                    <>
                        {hasFilters && (
                            <Button
                                variant="ghost"
                                className="w-full justify-start gap-2 h-8 text-muted-foreground mb-1"
                                onClick={clearAll}
                            >
                                Clear filters
                            </Button>
                        )}
                        <ScrollArea className="max-h-[200px]">
                            <div className="space-y-0.5">
                                {allTags.map(tag => {
                                    const isSelected = selectedTags.includes(tag);
                                    return (
                                        <Button
                                            key={tag}
                                            variant={isSelected ? 'secondary' : 'ghost'}
                                            className="w-full justify-start gap-2 h-8"
                                            onClick={() => toggleTag(tag)}
                                        >
                                            <div 
                                                className={cn(
                                                    "h-3 w-3 rounded-full border",
                                                    isSelected ? "bg-primary border-primary" : "border-muted-foreground"
                                                )}
                                            />
                                            <span className="truncate flex-1 text-left">{tag}</span>
                                            {isSelected && <Check size={12} className="ml-auto shrink-0" />}
                                        </Button>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
};

export default TagFilterDropdown;
