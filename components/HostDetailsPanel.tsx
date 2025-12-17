import {
  Check,
  FolderPlus,
  Globe,
  Key,
  Link2,
  Plus,
  Shield,
  Tag,
  TerminalSquare,
  Variable,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useI18n } from "../application/i18n/I18nProvider";
import { TERMINAL_THEMES } from "../infrastructure/config/terminalThemes";
import { MIN_FONT_SIZE, MAX_FONT_SIZE } from "../infrastructure/config/fonts";
import { cn } from "../lib/utils";
import { EnvVar, Host, ProxyConfig, SSHKey } from "../types";
import { DistroAvatar } from "./DistroAvatar";
import ThemeSelectPanel from "./ThemeSelectPanel";
import {
  AsidePanel,
  AsidePanelContent,
  AsidePanelFooter,
} from "./ui/aside-panel";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Combobox, ComboboxOption, MultiCombobox } from "./ui/combobox";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

// Import host-details sub-panels
import {
  ChainPanel,
  CreateGroupPanel,
  EnvVarsPanel,
  ProxyPanel,
} from "./host-details";

type CredentialType = "sshid" | "key" | "certificate" | null;
type SubPanel =
  | "none"
  | "create-group"
  | "proxy"
  | "chain"
  | "env-vars"
  | "theme-select"
  | "telnet-theme-select";

interface HostDetailsPanelProps {
  initialData?: Host | null;
  availableKeys: SSHKey[];
  groups: string[];
  allTags?: string[]; // All available tags for autocomplete
  allHosts?: Host[]; // All hosts for chain selection
  onSave: (host: Host) => void;
  onCancel: () => void;
  onCreateGroup?: (groupPath: string) => void; // Callback to create a new group
  onCreateTag?: (tag: string) => void; // Callback to create a new tag
}

const HostDetailsPanel: React.FC<HostDetailsPanelProps> = ({
  initialData,
  availableKeys,
  groups,
  allTags = [],
  allHosts = [],
  onSave,
  onCancel,
  onCreateGroup,
  onCreateTag,
}) => {
  const { t } = useI18n();
  const [form, setForm] = useState<Host>(
    () =>
      initialData ||
      ({
        id: crypto.randomUUID(),
        label: "",
        hostname: "",
        port: 22,
        username: "root",
        protocol: "ssh",
        tags: [],
        os: "linux",
        agentForwarding: false,
        authMethod: "password",
        charset: "UTF-8",
        theme: "Flexoki Dark",
        createdAt: Date.now(),
      } as Host),
  );

  // Sub-panel state
  const [activeSubPanel, setActiveSubPanel] = useState<SubPanel>("none");

  // Credential selection state
  const [credentialPopoverOpen, setCredentialPopoverOpen] = useState(false);
  const [selectedCredentialType, setSelectedCredentialType] =
    useState<CredentialType>(null);

  // New group creation state
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupParent, setNewGroupParent] = useState("");

  // Group input state for inline creation suggestion
  const [groupInputValue, setGroupInputValue] = useState(form.group || "");

  // Check if the entered group is new (doesn't exist)
  // Reserved for future use: showing inline "create new group" suggestion
  const _isNewGroup = useMemo(() => {
    const trimmed = groupInputValue.trim();
    return trimmed.length > 0 && !groups.includes(trimmed);
  }, [groupInputValue, groups]);

  useEffect(() => {
    if (initialData) {
      // Ensure telnetEnabled is set when protocol is telnet
      const updatedData = { ...initialData };
      if (initialData.protocol === "telnet" && !initialData.telnetEnabled) {
        updatedData.telnetEnabled = true;
        updatedData.telnetPort =
          initialData.telnetPort || initialData.port || 23;
      }
      setForm(updatedData);
      setGroupInputValue(initialData.group || "");
    }
  }, [initialData]);

  const update = <K extends keyof Host>(key: K, value: Host[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateProxyConfig = useCallback(
    (field: keyof ProxyConfig, value: string | number) => {
      setForm((prev) => ({
        ...prev,
        proxyConfig: {
          type: prev.proxyConfig?.type || "http",
          host: prev.proxyConfig?.host || "",
          port: prev.proxyConfig?.port || 8080,
          ...prev.proxyConfig,
          [field]: value,
        },
      }));
    },
    [],
  );

  const clearProxyConfig = useCallback(() => {
    setForm((prev) => {
      const { proxyConfig: _proxyConfig, ...rest } = prev;
      return rest as Host;
    });
  }, []);

  const addHostToChain = (hostId: string) => {
    setForm((prev) => ({
      ...prev,
      hostChain: {
        hostIds: [...(prev.hostChain?.hostIds || []), hostId],
      },
    }));
  };

  const removeHostFromChain = (index: number) => {
    setForm((prev) => ({
      ...prev,
      hostChain: {
        hostIds: (prev.hostChain?.hostIds || []).filter((_, i) => i !== index),
      },
    }));
  };

  const clearHostChain = useCallback(() => {
    setForm((prev) => {
      const { hostChain: _hostChain, ...rest } = prev;
      return rest as Host;
    });
  }, []);

  // Environment variables state
  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");

  const addEnvVar = () => {
    if (!newEnvName.trim()) return;
    const newVar: EnvVar = { name: newEnvName.trim(), value: newEnvValue };
    setForm((prev) => ({
      ...prev,
      environmentVariables: [...(prev.environmentVariables || []), newVar],
    }));
    setNewEnvName("");
    setNewEnvValue("");
  };

  const removeEnvVar = (index: number) => {
    setForm((prev) => ({
      ...prev,
      environmentVariables: (prev.environmentVariables || []).filter(
        (_, i) => i !== index,
      ),
    }));
  };

  const handleSubmit = () => {
    if (!form.hostname || !form.label) return;
    const cleaned: Host = {
      ...form,
      group: groupInputValue.trim() || form.group,
      tags: form.tags || [],
      port: form.port || 22,
    };
    onSave(cleaned);
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const fullPath = newGroupParent
      ? `${newGroupParent}/${newGroupName.trim()}`
      : newGroupName.trim();
    onCreateGroup?.(fullPath);
    setGroupInputValue(fullPath);
    update("group", fullPath);
    setNewGroupName("");
    setNewGroupParent("");
    setActiveSubPanel("none");
  };

  // Get available hosts for chain (exclude current host)
  const availableHostsForChain = useMemo(() => {
    const chainedIds = new Set(form.hostChain?.hostIds || []);
    return allHosts.filter((h) => h.id !== form.id && !chainedIds.has(h.id));
  }, [allHosts, form.id, form.hostChain?.hostIds]);

  // Get hosts in chain
  const chainedHosts = useMemo(() => {
    const ids = form.hostChain?.hostIds || [];
    return ids
      .map((id) => allHosts.find((h) => h.id === id))
      .filter(Boolean) as Host[];
  }, [allHosts, form.hostChain?.hostIds]);

  // Compute group options for Combobox
  const groupOptions: ComboboxOption[] = useMemo(() => {
    return groups.map((g) => ({
      value: g,
      label: g.includes("/") ? g.split("/").pop()! : g,
      sublabel: g.includes("/") ? g : undefined,
    }));
  }, [groups]);

  // Compute tag options for MultiCombobox
  const tagOptions: ComboboxOption[] = useMemo(() => {
    const allTagSet = new Set([...allTags, ...(form.tags || [])]);
    return Array.from(allTagSet).map((t) => ({ value: t, label: t }));
  }, [allTags, form.tags]);

  // Available keys by category
  const keysByCategory = useMemo(() => {
    return {
      key: availableKeys.filter((k) => k.category === "key"),
      certificate: availableKeys.filter((k) => k.category === "certificate"),
      identity: availableKeys.filter((k) => k.category === "identity"),
    };
  }, [availableKeys]);

  // Render sub-panels
  if (activeSubPanel === "create-group") {
    return (
      <CreateGroupPanel
        newGroupName={newGroupName}
        setNewGroupName={setNewGroupName}
        newGroupParent={newGroupParent}
        setNewGroupParent={setNewGroupParent}
        groups={groups}
        onSave={handleCreateGroup}
        onBack={() => setActiveSubPanel("none")}
        onCancel={onCancel}
      />
    );
  }

  if (activeSubPanel === "proxy") {
    return (
      <ProxyPanel
        proxyConfig={form.proxyConfig}
        onUpdateProxy={updateProxyConfig}
        onClearProxy={clearProxyConfig}
        onBack={() => setActiveSubPanel("none")}
        onCancel={onCancel}
      />
    );
  }

  if (activeSubPanel === "chain") {
    return (
      <ChainPanel
        formLabel={form.label}
        formHostname={form.hostname}
        form={form}
        chainedHosts={chainedHosts}
        availableHostsForChain={availableHostsForChain}
        onAddHost={addHostToChain}
        onRemoveHost={removeHostFromChain}
        onClearChain={clearHostChain}
        onBack={() => setActiveSubPanel("none")}
        onCancel={onCancel}
      />
    );
  }

  // Environment Variables sub-panel
  if (activeSubPanel === "env-vars") {
    return (
      <EnvVarsPanel
        hostLabel={form.label}
        hostHostname={form.hostname}
        environmentVariables={form.environmentVariables || []}
        newEnvName={newEnvName}
        newEnvValue={newEnvValue}
        setNewEnvName={setNewEnvName}
        setNewEnvValue={setNewEnvValue}
        onAddEnvVar={addEnvVar}
        onRemoveEnvVar={removeEnvVar}
        onUpdateEnvVar={(index, field, value) => {
          const newVars = [...(form.environmentVariables || [])];
          newVars[index] = { ...newVars[index], [field]: value };
          setForm((prev) => ({ ...prev, environmentVariables: newVars }));
        }}
        onSave={() => {
          if (newEnvName.trim()) addEnvVar();
          setActiveSubPanel("none");
        }}
        onBack={() => setActiveSubPanel("none")}
        onCancel={onCancel}
      />
    );
  }

  // Theme selection sub-panel (SSH)
  if (activeSubPanel === "theme-select") {
    return (
      <ThemeSelectPanel
        open={true}
        selectedThemeId={form.theme || "flexoki-dark"}
        onSelect={(themeId) => {
          update("theme", themeId);
          setActiveSubPanel("none");
        }}
        onClose={onCancel}
        onBack={() => setActiveSubPanel("none")}
        showBackButton={true}
      />
    );
  }

  // Theme selection sub-panel (Telnet)
  if (activeSubPanel === "telnet-theme-select") {
    return (
      <ThemeSelectPanel
        open={true}
        selectedThemeId={
          form.protocols?.find((p) => p.protocol === "telnet")?.theme ||
          form.theme ||
          "flexoki-dark"
        }
        onSelect={(themeId) => {
          // Update telnet protocol theme
          const telnetConfig = form.protocols?.find(
            (p) => p.protocol === "telnet",
          );
          if (telnetConfig) {
            const newProtocols = form.protocols?.map((p) =>
              p.protocol === "telnet" ? { ...p, theme: themeId } : p,
            );
            setForm((prev) => ({ ...prev, protocols: newProtocols }));
          } else {
            // Create new telnet protocol config with theme
            const newProtocols = [
              ...(form.protocols || []),
              {
                protocol: "telnet" as const,
                port: form.telnetPort || 23,
                enabled: true,
                theme: themeId,
              },
            ];
            setForm((prev) => ({ ...prev, protocols: newProtocols }));
          }
          setActiveSubPanel("none");
        }}
        onClose={onCancel}
        onBack={() => setActiveSubPanel("none")}
        showBackButton={true}
      />
    );
  }

  // Main panel
  return (
    <AsidePanel
      open={true}
      onClose={onCancel}
      title={
        initialData ? t("hostDetails.title.details") : t("hostDetails.title.new")
      }
      actions={
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleSubmit}
          disabled={!form.hostname || !form.label}
          aria-label={t("hostDetails.saveAria")}
        >
          <Check size={16} />
        </Button>
      }
    >
      <AsidePanelContent>
        <Card className="p-3 space-y-2 bg-card border-border/80">
          <p className="text-xs font-semibold">
            {t("hostDetails.section.address")}
          </p>
          <div className="flex items-center gap-2">
            <DistroAvatar
              host={form as Host}
              fallback={
                form.label?.slice(0, 2).toUpperCase() ||
                form.hostname?.slice(0, 2).toUpperCase() ||
                "H"
              }
              className="h-10 w-10"
            />
            <Input
              placeholder={t("hostDetails.hostname.placeholder")}
              value={form.hostname}
              onChange={(e) => update("hostname", e.target.value)}
              className="h-10 flex-1"
            />
          </div>
        </Card>

        <Card className="p-3 space-y-3 bg-card border-border/80">
          <p className="text-xs font-semibold">
            {t("hostDetails.section.general")}
          </p>
          <Input
            placeholder={t("hostDetails.label.placeholder")}
            value={form.label}
            onChange={(e) => update("label", e.target.value)}
            className="h-10"
          />

          {/* Group selection with Combobox */}
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
              <FolderPlus size={16} className="text-muted-foreground" />
            </div>
            <Combobox
              options={groupOptions}
              value={form.group || ""}
              onValueChange={(val) => update("group", val)}
              placeholder={t("hostDetails.group.placeholder")}
              allowCreate={true}
              onCreateNew={(val) => {
                onCreateGroup?.(val);
                update("group", val);
              }}
              createText="Create Group"
              triggerClassName="flex-1 h-10"
            />
          </div>

          {/* Tag selection with MultiCombobox */}
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center shrink-0">
              <Tag size={16} className="text-muted-foreground" />
            </div>
            <MultiCombobox
              options={tagOptions}
              values={form.tags || []}
              onValuesChange={(vals) => update("tags", vals)}
              placeholder="Add tags..."
              allowCreate={true}
              onCreateNew={(val) => onCreateTag?.(val)}
              createText="Create Tag"
              triggerClassName="flex-1 min-h-10"
            />
          </div>
        </Card>

        <Card className="p-3 space-y-3 bg-card border-border/80">
          <p className="text-xs font-semibold">
            {t("hostDetails.section.portCredentials")}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 h-10 flex items-center gap-2 bg-secondary/70 border border-border/70 rounded-md px-3">
              <span className="text-xs text-muted-foreground">SSH on</span>
              <div className="ml-auto w-1/2 min-w-0 flex items-center gap-2 justify-end">
                <Input
                  type="number"
                  value={form.port}
                  onChange={(e) => update("port", Number(e.target.value))}
                  className="h-8 flex-1 min-w-0 text-center"
                />
                <span className="text-xs text-muted-foreground">
                  {t("hostDetails.port")}
                </span>
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            <Input
              placeholder={t("hostDetails.username.placeholder")}
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              className="h-10"
            />
            <Input
              placeholder={t("hostDetails.password.placeholder")}
              type="password"
              value={form.password || ""}
              onChange={(e) => update("password", e.target.value)}
              className="h-10"
            />

            {/* Selected credential display */}
            {form.identityFileId && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/50 border border-border/60">
                {form.authMethod === "certificate" ? (
                  <Shield size={14} className="text-primary" />
                ) : (
                  <Key size={14} className="text-primary" />
                )}
                <span className="text-sm flex-1 truncate">
                  {availableKeys.find((k) => k.id === form.identityFileId)
                    ?.label || "Key"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    update("identityFileId", undefined);
                    update("authMethod", "password");
                    setSelectedCredentialType(null);
                  }}
                >
                  <X size={12} />
                </Button>
              </div>
            )}

            {/* Credential type selection with inline popover - hidden when credential is selected */}
            {!form.identityFileId &&
              !selectedCredentialType && (
                <Popover
                  open={credentialPopoverOpen}
                  onOpenChange={setCredentialPopoverOpen}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      <Plus size={12} />
                      <span>{t("hostDetails.credential.keyCertificate")}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[200px] p-1"
                    align="start"
                    sideOffset={4}
                  >
                    <div className="space-y-0.5">
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-secondary/80 transition-colors text-left"
                        onClick={() => {
                          setSelectedCredentialType("key");
                          setCredentialPopoverOpen(false);
                        }}
                      >
                        <Key size={16} className="text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {t("hostDetails.credential.key")}
                        </span>
                      </button>

                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-secondary/80 transition-colors text-left"
                        onClick={() => {
                          setSelectedCredentialType("certificate");
                          setCredentialPopoverOpen(false);
                        }}
                      >
                        <Shield size={16} className="text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {t("hostDetails.credential.certificate")}
                        </span>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}

            {/* Key selection combobox - appears after selecting "Key" type */}
            {selectedCredentialType === "key" && !form.identityFileId && (
              <div className="flex items-center gap-1">
                <Combobox
                  options={keysByCategory.key.map((k) => ({
                    value: k.id,
                    label: k.label,
                    sublabel: `${k.type}${k.keySize ? ` ${k.keySize}` : ""}`,
                    icon: <Key size={14} className="text-muted-foreground" />,
                  }))}
                  value={form.identityFileId}
                  onValueChange={(val) => {
                    update("identityFileId", val);
                    update("authMethod", "key");
                    setSelectedCredentialType(null);
                  }}
                  placeholder={t("hostDetails.keys.search")}
                  emptyText={t("hostDetails.keys.empty")}
                  icon={<Key size={14} className="text-muted-foreground" />}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setSelectedCredentialType(null)}
                >
                  <X size={14} />
                </Button>
              </div>
            )}

            {/* Certificate selection combobox - appears after selecting "Certificate" type */}
	            {selectedCredentialType === "certificate" &&
	              !form.identityFileId && (
	                <div className="flex items-center gap-1">
	                  <Combobox
                    options={keysByCategory.certificate.map((k) => ({
                      value: k.id,
                      label: k.label,
                      icon: (
                        <Shield size={14} className="text-muted-foreground" />
                      ),
                    }))}
                    value={form.identityFileId}
                    onValueChange={(val) => {
                      update("identityFileId", val);
                      update("authMethod", "certificate");
                      setSelectedCredentialType(null);
                    }}
                    placeholder={t("hostDetails.certs.search")}
                    emptyText={t("hostDetails.certs.empty")}
                    icon={
                      <Shield size={14} className="text-muted-foreground" />
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setSelectedCredentialType(null)}
                  >
                    <X size={14} />
	                  </Button>
	                </div>
	              )}
	          </div>
	        </Card>

        <Card className="p-3 space-y-3 bg-card border-border/80">
          <p className="text-xs font-semibold">
            {t("hostDetails.section.appearance")}
          </p>

          {/* SSH Theme Selection */}
          <button
            type="button"
            className="w-full flex items-center gap-3 p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
            onClick={() => setActiveSubPanel("theme-select")}
          >
            <div
              className="w-12 h-8 rounded-md border border-border/60 flex items-center justify-center text-[6px] font-mono overflow-hidden"
              style={{
                backgroundColor:
                  TERMINAL_THEMES.find(
                    (t) => t.id === (form.theme || "flexoki-dark"),
                  )?.colors.background || "#100F0F",
                color:
                  TERMINAL_THEMES.find(
                    (t) => t.id === (form.theme || "flexoki-dark"),
                  )?.colors.foreground || "#CECDC3",
              }}
            >
              <div className="p-0.5">
                <div
                  style={{
                    color: TERMINAL_THEMES.find(
                      (t) => t.id === (form.theme || "flexoki-dark"),
                    )?.colors.green,
                  }}
                >
                  $
                </div>
              </div>
            </div>
            <span className="text-sm flex-1">
              {TERMINAL_THEMES.find(
                (t) => t.id === (form.theme || "flexoki-dark"),
              )?.name || "Flexoki Dark"}
            </span>
          </button>

          {/* Font Size */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Font Size:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if ((form.fontSize || 14) > MIN_FONT_SIZE) {
                  update("fontSize", (form.fontSize || 14) - 1);
                }
              }}
              disabled={(form.fontSize || 14) <= MIN_FONT_SIZE}
              className="px-2 h-8"
            >
              -
            </Button>
            <Input
              type="number"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              value={form.fontSize || 14}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (val >= MIN_FONT_SIZE && val <= MAX_FONT_SIZE) {
                  update("fontSize", val);
                }
              }}
              className="w-16 text-center h-8"
            />
            <span className="text-sm text-muted-foreground">pt</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if ((form.fontSize || 14) < MAX_FONT_SIZE) {
                  update("fontSize", (form.fontSize || 14) + 1);
                }
              }}
              disabled={(form.fontSize || 14) >= MAX_FONT_SIZE}
              className="px-2 h-8"
            >
              +
            </Button>
          </div>
        </Card>

        <Card className="p-3 space-y-3 bg-card border-border/80">
          <p className="text-xs font-semibold">{t("hostDetails.section.mosh")}</p>
          <ToggleRow
            label="Mosh"
            enabled={!!form.moshEnabled}
            onToggle={() => update("moshEnabled", !form.moshEnabled)}
          />
        </Card>

        <Card className="p-3 space-y-2 bg-card border-border/80">
          <ToggleRow
            label={t("hostDetails.agentForwarding")}
            enabled={!!form.agentForwarding}
            onToggle={() => update("agentForwarding", !form.agentForwarding)}
          />
        </Card>

        {/* Host Chain Configuration - Only show when Agent Forwarding is enabled */}
        {form.agentForwarding && (
          <Card className="p-3 space-y-2 bg-card border-border/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 size={14} className="text-muted-foreground" />
                <p className="text-xs font-semibold">
                  {t("hostDetails.jumpHosts")}
                </p>
              </div>
              {chainedHosts.length > 0 ? (
                <Badge variant="secondary" className="text-xs">
                  {t("hostDetails.jumpHosts.hops", { count: chainedHosts.length })}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground"
                >
                  {t("hostDetails.jumpHosts.direct")}
                </Badge>
              )}
            </div>
            {chainedHosts.length > 0 && (
              <button
                className="w-full flex items-center gap-1 p-2 rounded-md bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
                onClick={() => setActiveSubPanel("chain")}
              >
                <Link2
                  size={14}
                  className="text-muted-foreground flex-shrink-0"
                />
                <span className="text-sm truncate">
                  {chainedHosts
                    .slice(0, 3)
                    .map((h) => h.hostname || h.label)
                    .join(" -> ")}
                  {chainedHosts.length > 3 && "..."}
                </span>
                <X
                  size={14}
                  className="text-muted-foreground hover:text-destructive flex-shrink-0 ml-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearHostChain();
                  }}
                />
              </button>
            )}
            {chainedHosts.length === 0 && (
              <Button
                variant="ghost"
                className="w-full h-9 justify-start gap-2 text-sm"
                onClick={() => setActiveSubPanel("chain")}
              >
                <Plus size={14} />
                {t("hostDetails.jumpHosts.configure")}
              </Button>
            )}
          </Card>
        )}

        {/* Proxy Configuration */}
        <Card className="p-3 space-y-2 bg-card border-border/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-muted-foreground" />
              <p className="text-xs font-semibold">{t("hostDetails.proxy")}</p>
            </div>
            {form.proxyConfig?.host ? (
              <Badge variant="secondary" className="text-xs">
                {form.proxyConfig.type?.toUpperCase()} {form.proxyConfig.host}:
                {form.proxyConfig.port}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-xs text-muted-foreground"
              >
                {t("hostDetails.proxy.none")}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            className="w-full h-9 justify-start gap-2 text-sm"
            onClick={() => setActiveSubPanel("proxy")}
          >
            <Plus size={14} />
            {form.proxyConfig?.host
              ? t("hostDetails.proxy.edit")
              : t("hostDetails.proxy.configure")}
          </Button>
        </Card>

        {/* Environment Variables */}
        <Card className="p-3 space-y-2 bg-card border-border/80">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Variable size={14} className="text-muted-foreground" />
              <p className="text-xs font-semibold">{t("hostDetails.envVars")}</p>
            </div>
          </div>
          {(form.environmentVariables?.length || 0) > 0 ? (
            <button
              className="w-full flex items-center gap-1 p-2 rounded-md bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer"
              onClick={() => setActiveSubPanel("env-vars")}
            >
              <span className="text-sm truncate">
                {form.environmentVariables
                  ?.slice(0, 2)
                  .map((v) => `${v.name}=${v.value}`)
                  .join(", ")}
                {(form.environmentVariables?.length || 0) > 2 && "..."}
              </span>
              <X
                size={14}
                className="text-muted-foreground hover:text-destructive flex-shrink-0 ml-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  setForm((prev) => ({ ...prev, environmentVariables: [] }));
                }}
              />
            </button>
          ) : (
            <Button
              variant="ghost"
              className="w-full h-9 justify-start gap-2 text-sm"
              onClick={() => setActiveSubPanel("env-vars")}
            >
              <Plus size={14} />
              {t("hostDetails.envVars.add")}
            </Button>
          )}
        </Card>

        {/* Startup Command */}
        <Card className="p-3 space-y-2 bg-card border-border/80">
          <div className="flex items-center gap-2">
            <TerminalSquare size={14} className="text-muted-foreground" />
            <p className="text-xs font-semibold">{t("hostDetails.startupCommand")}</p>
          </div>
          <Input
            placeholder={t("hostDetails.startupCommand.placeholder")}
            value={form.startupCommand || ""}
            onChange={(e) => update("startupCommand", e.target.value)}
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">
            {t("hostDetails.startupCommand.help")}
          </p>
        </Card>

        {/* Telnet Protocol Section - Separator and Configuration */}
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px bg-border/60" />
          <span className="text-xs text-muted-foreground">{t("hostDetails.otherProtocols")}</span>
          <div className="flex-1 h-px bg-border/60" />
        </div>

        {/* Telnet Protocol Card */}
        {form.telnetEnabled || form.protocol === "telnet" ? (
          <Card className="p-3 space-y-3 bg-card border-border/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 bg-secondary/70 border border-border/70 rounded-md px-2 py-1">
                <span className="text-xs text-muted-foreground">{t("hostDetails.telnetOn")}</span>
                <Input
                  type="number"
                  value={form.telnetPort || 23}
                  onChange={(e) => update("telnetPort", Number(e.target.value))}
                  className="h-8 w-16 text-center"
                />
                <span className="text-xs text-muted-foreground">{t("hostDetails.port")}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => update("telnetEnabled", false)}
              >
                <X size={14} />
              </Button>
            </div>

            {/* Telnet Credentials */}
            <p className="text-xs font-semibold">{t("hostDetails.telnet.credentials")}</p>
            <Input
              placeholder={t("hostDetails.telnet.username")}
              value={form.telnetUsername || form.username || ""}
              onChange={(e) =>
                update("telnetUsername" as keyof Host, e.target.value)
              }
              className="h-10"
            />
            <Input
              placeholder={t("hostDetails.telnet.password")}
              type="password"
              value={form.telnetPassword || form.password || ""}
              onChange={(e) =>
                update("telnetPassword" as keyof Host, e.target.value)
              }
              className="h-10"
            />

            {/* Telnet Charset */}
            <Input
              placeholder={t("hostDetails.charset.placeholder")}
              value={form.charset || "UTF-8"}
              onChange={(e) => update("charset", e.target.value)}
              className="h-10"
            />

            {/* Telnet Theme Selection */}
            <button
              type="button"
              className="w-full flex items-center gap-3 p-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
              onClick={() => setActiveSubPanel("telnet-theme-select")}
            >
              <div
                className="w-12 h-8 rounded-md border border-border/60 flex items-center justify-center text-[6px] font-mono overflow-hidden"
                style={{
                  backgroundColor:
                    TERMINAL_THEMES.find(
                      (t) =>
                        t.id ===
                        (form.protocols?.find((p) => p.protocol === "telnet")
                          ?.theme ||
                          form.theme ||
                          "flexoki-dark"),
                    )?.colors.background || "#100F0F",
                  color:
                    TERMINAL_THEMES.find(
                      (t) =>
                        t.id ===
                        (form.protocols?.find((p) => p.protocol === "telnet")
                          ?.theme ||
                          form.theme ||
                          "flexoki-dark"),
                    )?.colors.foreground || "#CECDC3",
                }}
              >
                <div className="p-0.5">
                  <div
                    style={{
                      color: TERMINAL_THEMES.find(
                        (t) =>
                          t.id ===
                          (form.protocols?.find((p) => p.protocol === "telnet")
                            ?.theme ||
                            form.theme ||
                            "flexoki-dark"),
                      )?.colors.green,
                    }}
                  >
                    $
                  </div>
                </div>
              </div>
              <span className="text-sm flex-1">
                {TERMINAL_THEMES.find(
                  (t) =>
                    t.id ===
                    (form.protocols?.find((p) => p.protocol === "telnet")
                      ?.theme ||
                      form.theme ||
                      "flexoki-dark"),
                )?.name || "Flexoki Dark"}
              </span>
            </button>
          </Card>
        ) : (
          <Button
            variant="ghost"
            className="w-full h-10 justify-start gap-2 border border-dashed border-border/60"
            onClick={() => {
              update("telnetEnabled", true);
              update("telnetPort", 23);
            }}
          >
            <Plus size={14} />
            {t("hostDetails.telnet.add")}
          </Button>
        )}
      </AsidePanelContent>
      <AsidePanelFooter>
        <Button
          className="w-full h-10"
          onClick={handleSubmit}
          disabled={!form.hostname || !form.label}
        >
          {t("common.save")}
        </Button>
      </AsidePanelFooter>
    </AsidePanel>
  );
};

interface ToggleRowProps {
  label: string;
  enabled: boolean;
  onToggle: () => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, enabled, onToggle }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between h-10 px-3 rounded-md border border-border/70 bg-secondary/70">
      <span className="text-sm">{label}</span>
      <Button
        variant={enabled ? "secondary" : "ghost"}
        size="sm"
        className={cn("h-8 min-w-[72px]", enabled && "bg-primary/20")}
        onClick={onToggle}
      >
        {enabled ? t("common.enabled") : t("common.disabled")}
      </Button>
    </div>
  );
};

export default HostDetailsPanel;
