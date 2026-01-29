import { Host } from "./models";

const DEFAULT_SSH_PORT = 22;

/**
 * Serialize a single jump host to ProxyJump format
 * Format: [user@]host[:port]
 */
const serializeJumpHost = (host: Host): string => {
  let result = "";
  if (host.username) {
    result += `${host.username}@`;
  }
  // Use label as the host alias if it matches a Host block, otherwise use hostname
  result += host.label || host.hostname;
  if (host.port && host.port !== DEFAULT_SSH_PORT) {
    result += `:${host.port}`;
  }
  return result;
};

/**
 * Build ProxyJump directive from hostChain
 * @param host - The host with hostChain
 * @param allHosts - All hosts to look up jump host details
 * @returns ProxyJump value string or null if chain is empty/invalid
 */
const buildProxyJumpValue = (host: Host, allHosts: Host[]): string | null => {
  if (!host.hostChain?.hostIds || host.hostChain.hostIds.length === 0) {
    return null;
  }

  const hostMap = new Map(allHosts.map(h => [h.id, h]));
  const jumpParts: string[] = [];

  for (const jumpHostId of host.hostChain.hostIds) {
    const jumpHost = hostMap.get(jumpHostId);
    if (jumpHost) {
      jumpParts.push(serializeJumpHost(jumpHost));
    }
  }

  return jumpParts.length > 0 ? jumpParts.join(",") : null;
};

export const serializeHostsToSshConfig = (hosts: Host[], allHosts?: Host[]): string => {
  const blocks: string[] = [];
  // Use provided allHosts for jump host lookup, or fall back to hosts array
  const hostsForLookup = allHosts || hosts;

  for (const host of hosts) {
    if (host.protocol && host.protocol !== "ssh") continue;

    const lines: string[] = [];
    const alias = host.label || host.hostname;
    lines.push(`Host ${alias}`);

    if (host.hostname !== alias) {
      lines.push(`    HostName ${host.hostname}`);
    }

    if (host.username) {
      lines.push(`    User ${host.username}`);
    }

    if (host.port && host.port !== DEFAULT_SSH_PORT) {
      lines.push(`    Port ${host.port}`);
    }

    // Serialize ProxyJump if host has a chain
    const proxyJumpValue = buildProxyJumpValue(host, hostsForLookup);
    if (proxyJumpValue) {
      lines.push(`    ProxyJump ${proxyJumpValue}`);
    }

    blocks.push(lines.join("\n"));
  }

  return blocks.join("\n\n") + "\n";
};

export const mergeWithExistingSshConfig = (
  existingContent: string,
  managedHosts: Host[],
  managedHostnameSet: Set<string>,
  allHosts?: Host[],
): string => {
  const lines = existingContent.split(/\r?\n/);
  const preservedBlocks: string[] = [];
  let currentBlock: string[] = [];
  let currentHostPatterns: string[] = [];
  let isManaged = false;

  const flush = () => {
    if (currentBlock.length > 0) {
      if (!isManaged) {
        preservedBlocks.push(currentBlock.join("\n"));
      }
      currentBlock = [];
      currentHostPatterns = [];
      isManaged = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.replace(/#.*/, "").trim();
    if (!trimmed && currentBlock.length === 0) continue;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const keyword = tokens[0]?.toLowerCase();

    if (keyword === "host") {
      flush();
      currentHostPatterns = tokens.slice(1);
      isManaged = currentHostPatterns.some((p) => managedHostnameSet.has(p.toLowerCase()));
      currentBlock.push(line);
    } else if (keyword === "match") {
      flush();
      currentBlock.push(line);
    } else {
      currentBlock.push(line);
    }
  }
  flush();

  const managedContent = serializeHostsToSshConfig(managedHosts, allHosts);
  const preserved = preservedBlocks.join("\n\n");

  if (preserved.trim()) {
    return preserved + "\n\n" + managedContent;
  }
  return managedContent;
};
