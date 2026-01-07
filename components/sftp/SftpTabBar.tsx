/**
 * SFTP Tab Bar Component
 *
 * A tab bar for managing multiple SFTP connections in a single pane.
 * Features:
 * - Tab items with close button
 * - Add button (+) to open HostSelectModal
 * - Scrollable when many tabs are open
 * - Drag-and-drop reordering of tabs
 */

import { HardDrive, Monitor, Plus, X } from "lucide-react";
import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export interface SftpTab {
  id: string;
  label: string;
  isLocal: boolean;
  hostId: string | null;
}

interface SftpTabBarProps {
  tabs: SftpTab[];
  activeTabId: string | null;
  side: "left" | "right";
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  onReorderTabs: (
    draggedId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
}

const SftpTabBarInner: React.FC<SftpTabBarProps> = ({
  tabs,
  activeTabId,
  side: _side,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onReorderTabs,
}) => {
  const { t } = useI18n();

  // Refs for scrollable tab container
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Drag state
  const [dropIndicator, setDropIndicator] = useState<{
    tabId: string;
    position: "before" | "after";
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const draggedTabIdRef = useRef<string | null>(null);

  // Check scroll state
  const updateScrollState = useCallback(() => {
    const container = tabsContainerRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1,
      );
    }
  }, []);

  // Update scroll state on mount and resize
  useEffect(() => {
    updateScrollState();
    const container = tabsContainerRef.current;
    if (container) {
      container.addEventListener("scroll", updateScrollState);
      const resizeObserver = new ResizeObserver(updateScrollState);
      resizeObserver.observe(container);
      return () => {
        container.removeEventListener("scroll", updateScrollState);
        resizeObserver.disconnect();
      };
    }
  }, [updateScrollState, tabs]);

  // Scroll to active tab when it changes
  useLayoutEffect(() => {
    if (!activeTabId) return;
    const container = tabsContainerRef.current;
    if (!container) return;

    const activeTabElement = container.querySelector(
      `[data-tab-id="${activeTabId}"]`,
    ) as HTMLElement | null;
    if (activeTabElement) {
      const containerRect = container.getBoundingClientRect();
      const tabRect = activeTabElement.getBoundingClientRect();

      if (tabRect.left < containerRect.left) {
        container.scrollLeft -= containerRect.left - tabRect.left + 8;
      } else if (tabRect.right > containerRect.right) {
        container.scrollLeft += tabRect.right - containerRect.right + 8;
      }
    }
    setTimeout(updateScrollState, 100);
  }, [activeTabId, updateScrollState]);

  // Drag handlers
  const handleTabDragStart = useCallback(
    (e: React.DragEvent, tabId: string) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("sftp-tab-id", tabId);
      draggedTabIdRef.current = tabId;
      setTimeout(() => {
        setIsDragging(true);
      }, 0);
    },
    [],
  );

  const handleTabDragEnd = useCallback(() => {
    draggedTabIdRef.current = null;
    setDropIndicator(null);
    setIsDragging(false);
  }, []);

  const handleTabDragOver = useCallback(
    (e: React.DragEvent, tabId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      if (!draggedTabIdRef.current || draggedTabIdRef.current === tabId) {
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const position: "before" | "after" =
        e.clientX < midpoint ? "before" : "after";

      setDropIndicator({ tabId, position });
    },
    [],
  );

  const handleTabDrop = useCallback(
    (e: React.DragEvent, targetTabId: string) => {
      e.preventDefault();
      const draggedId =
        e.dataTransfer.getData("sftp-tab-id") || draggedTabIdRef.current;

      if (draggedId && draggedId !== targetTabId && dropIndicator) {
        onReorderTabs(draggedId, targetTabId, dropIndicator.position);
      }

      setDropIndicator(null);
      setIsDragging(false);
    },
    [dropIndicator, onReorderTabs],
  );

  const handleCloseTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      onCloseTab(tabId);
    },
    [onCloseTab],
  );

  return (
    <div className="flex items-center gap-1 h-8 px-2 border-b border-border/60 bg-secondary/30">
      {/* Scrollable tabs container */}
      <div className="relative flex-1 min-w-0 flex">
        {/* Left fade mask */}
        {canScrollLeft && (
          <div
            className="absolute left-0 top-0 bottom-0 w-6 pointer-events-none z-10"
            style={{
              background:
                "linear-gradient(to right, hsl(var(--secondary) / 0.9), transparent)",
            }}
          />
        )}

        <div
          ref={tabsContainerRef}
          className="flex items-center gap-1 overflow-x-auto scrollbar-none max-w-full"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {tabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            const isBeingDragged =
              isDragging && draggedTabIdRef.current === tab.id;
            const showDropIndicatorBefore =
              dropIndicator?.tabId === tab.id &&
              dropIndicator.position === "before";
            const showDropIndicatorAfter =
              dropIndicator?.tabId === tab.id &&
              dropIndicator.position === "after";

            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                onClick={() => onSelectTab(tab.id)}
                draggable
                onDragStart={(e) => handleTabDragStart(e, tab.id)}
                onDragEnd={handleTabDragEnd}
                onDragOver={(e) => handleTabDragOver(e, tab.id)}
                onDrop={(e) => handleTabDrop(e, tab.id)}
                className={cn(
                  "relative h-6 pl-2 pr-1 min-w-[100px] max-w-[160px] rounded-md border text-xs font-medium cursor-pointer flex items-center justify-between gap-1 flex-shrink-0",
                  "transition-all duration-200 ease-out",
                  isActive
                    ? "bg-accent/20 text-foreground border-accent"
                    : "border-border/60 text-muted-foreground hover:border-accent/40 hover:text-foreground",
                  isBeingDragged ? "opacity-40 scale-95" : "",
                )}
              >
                {/* Drop indicator line - before */}
                {showDropIndicatorBefore && isDragging && (
                  <div className="absolute -left-1 top-1 bottom-1 w-0.5 bg-primary rounded-full shadow-[0_0_8px_2px] shadow-primary/50 animate-pulse" />
                )}
                {/* Drop indicator line - after */}
                {showDropIndicatorAfter && isDragging && (
                  <div className="absolute -right-1 top-1 bottom-1 w-0.5 bg-primary rounded-full shadow-[0_0_8px_2px] shadow-primary/50 animate-pulse" />
                )}

                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {tab.isLocal ? (
                    <Monitor
                      size={12}
                      className={cn(
                        "shrink-0",
                        isActive ? "text-accent" : "text-muted-foreground",
                      )}
                    />
                  ) : (
                    <HardDrive
                      size={12}
                      className={cn(
                        "shrink-0",
                        isActive ? "text-accent" : "text-muted-foreground",
                      )}
                    />
                  )}
                  <span className="truncate">{tab.label}</span>
                </div>

                <button
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  className="p-0.5 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                  aria-label={t("common.close")}
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Right fade mask */}
        {canScrollRight && (
          <div
            className="absolute right-0 top-0 bottom-0 w-6 pointer-events-none z-10"
            style={{
              background:
                "linear-gradient(to left, hsl(var(--secondary) / 0.9), transparent)",
            }}
          />
        )}
      </div>

      {/* Add tab button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onAddTab}
        title={t("sftp.pane.selectHost")}
      >
        <Plus size={14} />
      </Button>
    </div>
  );
};

export const SftpTabBar = memo(SftpTabBarInner);
SftpTabBar.displayName = "SftpTabBar";
