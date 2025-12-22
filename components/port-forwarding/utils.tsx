/**
 * Port Forwarding utilities and constants
 */
import { Globe,Server,Shuffle } from 'lucide-react';
import React from 'react';
import { PortForwardingType } from '../../domain/models';

export const TYPE_LABEL_KEYS: Record<PortForwardingType, string> = {
  local: 'pf.type.local',
  remote: 'pf.type.remote',
  dynamic: 'pf.type.dynamic',
};

export const TYPE_MENU_LABEL_KEYS: Record<PortForwardingType, string> = {
  local: 'pf.type.menu.local',
  remote: 'pf.type.menu.remote',
  dynamic: 'pf.type.menu.dynamic',
};

export const TYPE_DESCRIPTION_KEYS: Record<PortForwardingType, string> = {
  local: 'pf.type.local.desc',
  remote: 'pf.type.remote.desc',
  dynamic: 'pf.type.dynamic.desc',
};

export function getTypeLabel(
  t: (key: string, vars?: Record<string, unknown>) => string,
  type: PortForwardingType
): string {
  return t(TYPE_LABEL_KEYS[type]);
}

export function getTypeMenuLabel(
  t: (key: string, vars?: Record<string, unknown>) => string,
  type: PortForwardingType
): string {
  return t(TYPE_MENU_LABEL_KEYS[type]);
}

export function getTypeDescription(
  t: (key: string, vars?: Record<string, unknown>) => string,
  type: PortForwardingType
): string {
  return t(TYPE_DESCRIPTION_KEYS[type]);
}

export const TYPE_ICONS: Record<PortForwardingType, React.ReactNode> = {
  local: <Globe size={16} />,
  remote: <Server size={16} />,
  dynamic: <Shuffle size={16} />,
};

/**
 * Get status color class for a rule
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500';
    case 'connecting':
      return 'bg-yellow-500 animate-pulse';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-muted-foreground/40';
  }
}

/**
 * Get type badge color class
 */
export function getTypeColor(type: PortForwardingType, isActive: boolean): string {
  const colors = {
    local: isActive ? 'bg-blue-500 text-white' : 'bg-blue-500/15 text-blue-500',
    remote: isActive ? 'bg-orange-500 text-white' : 'bg-orange-500/15 text-orange-500',
    dynamic: isActive ? 'bg-purple-500 text-white' : 'bg-purple-500/15 text-purple-500',
  };
  return colors[type];
}

/**
 * Generate default label for a rule
 */
export function generateRuleLabel(
  type: PortForwardingType,
  localPort?: number,
  remoteHost?: string,
  remotePort?: number
): string {
  switch (type) {
    case 'local':
      return `Local:${localPort} -> ${remoteHost}:${remotePort}`;
    case 'remote':
      return `Remote:${localPort} -> ${remoteHost}:${remotePort}`;
    case 'dynamic':
      return `SOCKS:${localPort}`;
    default:
      return 'New Rule';
  }
}
