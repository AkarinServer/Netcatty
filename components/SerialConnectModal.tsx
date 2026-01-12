/**
 * Serial Port Connect Modal
 * Allows users to configure and connect to a serial port
 */
import { ChevronDown, ChevronUp, Cpu, RefreshCw, Usb } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../application/i18n/I18nProvider';
import { useTerminalBackend } from '../application/state/useTerminalBackend';
import type { SerialConfig, SerialFlowControl, SerialParity } from '../domain/models';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Combobox, type ComboboxOption } from './ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

interface SerialPort {
  path: string;
  manufacturer: string;
  serialNumber: string;
  vendorId: string;
  productId: string;
  pnpId: string;
  type?: 'hardware' | 'pseudo' | 'custom';
}

interface SerialConnectModalProps {
  open: boolean;
  onClose: () => void;
  onConnect: (config: SerialConfig) => void;
}

const BAUD_RATES = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const DATA_BITS: Array<5 | 6 | 7 | 8> = [5, 6, 7, 8];
const STOP_BITS: Array<1 | 1.5 | 2> = [1, 1.5, 2];
const PARITY_OPTIONS: SerialParity[] = ['none', 'even', 'odd', 'mark', 'space'];
const FLOW_CONTROL_OPTIONS: SerialFlowControl[] = ['none', 'xon/xoff', 'rts/cts'];

export const SerialConnectModal: React.FC<SerialConnectModalProps> = ({
  open,
  onClose,
  onConnect,
}) => {
  const { t } = useI18n();
  const [ports, setPorts] = useState<SerialPort[]>([]);
  const [isLoadingPorts, setIsLoadingPorts] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form state
  const [selectedPort, setSelectedPort] = useState('');
  const [baudRate, setBaudRate] = useState(115200);
  const [dataBits, setDataBits] = useState<5 | 6 | 7 | 8>(8);
  const [stopBits, setStopBits] = useState<1 | 1.5 | 2>(1);
  const [parity, setParity] = useState<SerialParity>('none');
  const [flowControl, setFlowControl] = useState<SerialFlowControl>('none');
  const [localEcho, setLocalEcho] = useState(false);
  const [lineMode, setLineMode] = useState(false);

  const terminalBackend = useTerminalBackend();

  const loadPorts = useCallback(async () => {
    setIsLoadingPorts(true);
    try {
      const result = await terminalBackend.listSerialPorts();
      setPorts(result);
      // Auto-select first port if available and no port is selected
      if (result.length > 0) {
        setSelectedPort((prev) => prev || result[0].path);
      }
    } catch (err) {
      console.error('[Serial] Failed to list ports:', err);
    } finally {
      setIsLoadingPorts(false);
    }
  }, [terminalBackend]);

  useEffect(() => {
    if (open) {
      loadPorts();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = () => {
    if (!selectedPort) return;

    const config: SerialConfig = {
      path: selectedPort,
      baudRate,
      dataBits,
      stopBits,
      parity,
      flowControl,
      localEcho,
      lineMode,
    };

    onConnect(config);
    onClose();
  };

  // Convert ports to Combobox options
  const portOptions: ComboboxOption[] = useMemo(() => {
    return ports.map((port) => ({
      value: port.path,
      label: port.path,
      sublabel: port.manufacturer || undefined,
    }));
  }, [ports]);

  // Validate: port path must start with /dev/ (Unix/macOS) or COM (Windows)
  const trimmedPort = selectedPort.trim();
  const isPortValid = trimmedPort.startsWith('/dev/') || /^COM\d+$/i.test(trimmedPort);
  const isBaudRateValid = BAUD_RATES.includes(baudRate);
  const isValid = isPortValid && isBaudRateValid;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Usb size={18} />
            {t('serial.modal.title')}
          </DialogTitle>
          <DialogDescription>
            {t('serial.modal.desc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Serial Port Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="serial-port">{t('serial.field.port')}</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadPorts}
                disabled={isLoadingPorts}
                className="h-6 px-2 text-xs"
              >
                <RefreshCw size={12} className={cn("mr-1", isLoadingPorts && "animate-spin")} />
                {t('common.refresh')}
              </Button>
            </div>

            {/* Combobox for port selection with manual input support */}
            <Combobox
              options={portOptions}
              value={selectedPort}
              onValueChange={setSelectedPort}
              placeholder={t('serial.field.selectPort')}
              emptyText={t('serial.noPorts')}
              allowCreate
              createText={t('common.use')}
              icon={<Usb size={14} className="text-muted-foreground" />}
            />

            {!isPortValid && selectedPort && (
              <p className="text-xs text-destructive">
                {t('serial.field.customPortPlaceholder')}
              </p>
            )}
          </div>

          {/* Baud Rate */}
          <div className="space-y-2">
            <Label htmlFor="baud-rate">{t('serial.field.baudRate')}</Label>
            <select
              id="baud-rate"
              value={baudRate}
              onChange={(e) => setBaudRate(parseInt(e.target.value, 10))}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {BAUD_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}
                </option>
              ))}
            </select>
          </div>

          {/* Advanced Options */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between h-9 px-0 hover:bg-transparent"
              >
                <span className="text-sm font-medium text-muted-foreground">
                  {t('common.advanced')}
                </span>
                {showAdvanced ? (
                  <ChevronUp size={14} className="text-muted-foreground" />
                ) : (
                  <ChevronDown size={14} className="text-muted-foreground" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              {/* Data Bits */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="data-bits">{t('serial.field.dataBits')}</Label>
                  <select
                    id="data-bits"
                    value={dataBits}
                    onChange={(e) => setDataBits(parseInt(e.target.value, 10) as 5 | 6 | 7 | 8)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {DATA_BITS.map((bits) => (
                      <option key={bits} value={bits}>
                        {bits}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Stop Bits */}
                <div className="space-y-2">
                  <Label htmlFor="stop-bits">{t('serial.field.stopBits')}</Label>
                  <select
                    id="stop-bits"
                    value={stopBits}
                    onChange={(e) => setStopBits(parseFloat(e.target.value) as 1 | 1.5 | 2)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {STOP_BITS.map((bits) => (
                      <option key={bits} value={bits}>
                        {bits}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Parity */}
              <div className="space-y-2">
                <Label htmlFor="parity">{t('serial.field.parity')}</Label>
                <select
                  id="parity"
                  value={parity}
                  onChange={(e) => setParity(e.target.value as SerialParity)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {PARITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {t(`serial.parity.${option}`)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Flow Control */}
              <div className="space-y-2">
                <Label htmlFor="flow-control">{t('serial.field.flowControl')}</Label>
                <select
                  id="flow-control"
                  value={flowControl}
                  onChange={(e) => setFlowControl(e.target.value as SerialFlowControl)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {FLOW_CONTROL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {t(`serial.flowControl.${option}`)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Terminal Options */}
              <div className="space-y-3 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="local-echo" className="text-sm font-medium cursor-pointer">
                      {t('serial.field.localEcho')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('serial.field.localEchoDesc')}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="local-echo"
                    checked={localEcho}
                    onChange={(e) => setLocalEcho(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="line-mode" className="text-sm font-medium cursor-pointer">
                      {t('serial.field.lineMode')}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t('serial.field.lineModeDesc')}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="line-mode"
                    checked={lineMode}
                    onChange={(e) => setLineMode(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConnect} disabled={!isValid}>
            <Cpu size={14} className="mr-2" />
            {t('common.connect')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SerialConnectModal;
