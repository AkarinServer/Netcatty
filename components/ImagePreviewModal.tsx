/**
 * ImagePreviewModal - Modal for previewing images in SFTP
 */
import {
  Loader2,
  Maximize2,
  Minus,
  Plus,
  RotateCcw
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../application/i18n/I18nProvider';
import { getImageMimeType } from '../lib/sftpFileUtils';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface ImagePreviewModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  imageData: ArrayBuffer | null;
  loading?: boolean;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  open,
  onClose,
  fileName,
  imageData,
  loading = false,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Create blob URL for the image
  const imageUrl = useMemo(() => {
    if (!imageData) return null;
    const mimeType = getImageMimeType(fileName);
    const blob = new Blob([imageData], { type: mimeType });
    return URL.createObjectURL(blob);
  }, [imageData, fileName]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  // Reset zoom and position when image changes
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [imageData]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev * 1.25, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(prev / 1.25, 0.1));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleFitToWindow = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return;

    const container = containerRef.current.getBoundingClientRect();
    const img = imageRef.current;
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;

    if (naturalWidth && naturalHeight) {
      const scaleX = (container.width - 40) / naturalWidth;
      const scaleY = (container.height - 40) / naturalHeight;
      const fitZoom = Math.min(scaleX, scaleY, 1);
      setZoom(fitZoom);
      setPosition({ x: 0, y: 0 });
    }
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.1, Math.min(5, prev * delta)));
  }, []);

  // Drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      handleZoomIn();
    } else if (e.key === '-') {
      e.preventDefault();
      handleZoomOut();
    } else if (e.key === '0') {
      e.preventDefault();
      handleResetZoom();
    }
  }, [handleZoomIn, handleZoomOut, handleResetZoom]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0" hideCloseButton>
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border/60 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-semibold truncate max-w-[400px]">
              {fileName}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleZoomOut}
                title={t('sftp.preview.zoomOut')}
              >
                <Minus size={14} />
              </Button>
              <span className="text-xs text-muted-foreground w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleZoomIn}
                title={t('sftp.preview.zoomIn')}
              >
                <Plus size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleResetZoom}
                title={t('sftp.preview.resetZoom')}
              >
                <RotateCcw size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleFitToWindow}
                title={t('sftp.preview.fitToWindow')}
              >
                <Maximize2 size={14} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Image viewer */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-hidden bg-muted/30 flex items-center justify-center cursor-grab active:cursor-grabbing"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          {loading && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">{t('sftp.status.loading')}</span>
            </div>
          )}

          {!loading && !imageUrl && (
            <div className="text-muted-foreground text-sm">
              {t('sftp.error.loadFailed')}
            </div>
          )}

          {!loading && imageUrl && (
            <img
              ref={imageRef}
              src={imageUrl}
              alt={fileName}
              className="max-w-none select-none"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                transformOrigin: 'center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              }}
              draggable={false}
              onLoad={handleFitToWindow}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImagePreviewModal;
