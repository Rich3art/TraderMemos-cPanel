import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/Skeleton";
import type { PayPalGatewaySettingsPut, PayPalMode, WhopGatewaySettingsPut } from "@/lib/api/settings";
import {
  usePayPalGatewaySettings,
  useUpdatePayPalGatewaySettings,
  useUpdateWhopGatewaySettings,
  useWhopGatewaySettings,
} from "@/lib/hooks/usePaymentGateways";
import { useMe } from "@/lib/hooks/useMe";
import { SettingsGroup, SettingsRow, SettingsSection } from "./settings-ui";

const EMPTY: PayPalGatewaySettingsPut = {
  enabled: false,
  mode: "sandbox",
  client_id: "",
  client_secret: "",
  webhook_id: "",
};

const EMPTY_WHOP: WhopGatewaySettingsPut = {
  enabled: false,
  mode: "sandbox",
  account_id: "",
  api_key: "",
  webhook_secret: "",
};

export function PaymentGatewaysTab() {
  const me = useMe();
  const isOwner = Boolean(me.data?.is_admin);
  const paypal = usePayPalGatewaySettings(isOwner);
  const whop = useWhopGatewaySettings(isOwner);
  const savePayPal = useUpdatePayPalGatewaySettings();
  const saveWhop = useUpdateWhopGatewaySettings();
  const [form, setForm] = useState<PayPalGatewaySettingsPut>(EMPTY);
  const [clearSecret, setClearSecret] = useState(false);
  const [clearWebhook, setClearWebhook] = useState(false);
  const [whopForm, setWhopForm] = useState<WhopGatewaySettingsPut>(EMPTY_WHOP);
  const [clearWhopKey, setClearWhopKey] = useState(false);
  const [clearWhopSecret, setClearWhopSecret] = useState(false);

  useEffect(() => {
    if (!paypal.data) return;
    setForm({
      enabled: paypal.data.enabled,
      mode: paypal.data.mode,
      client_id: paypal.data.client_id,
      client_secret: "",
      webhook_id: "",
    });
    setClearSecret(false);
    setClearWebhook(false);
  }, [paypal.data]);

  useEffect(() => {
    if (!whop.data) return;
    setWhopForm({
      enabled: whop.data.enabled,
      mode: whop.data.mode,
      account_id: whop.data.account_id,
      api_key: "",
      webhook_secret: "",
    });
    setClearWhopKey(false);
    setClearWhopSecret(false);
  }, [whop.data]);

  if (me.isLoading || paypal.isLoading || whop.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!isOwner) {
    return (
      <SettingsSection title="Payment gateways" description="Only an owner can manage payment providers.">
        <SettingsGroup>
          <SettingsRow primary="You are signed in as a member" secondary="Ask an owner for access." />
        </SettingsGroup>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Payment gateways"
      description="Configure server-side payment providers used by subscription packages."
    >
      <SettingsGroup>
        <div className="grid gap-4 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium">
              <CreditCard size={16} strokeWidth={1.75} />
              PayPal
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              Enabled
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={form.mode}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, mode: event.target.value as PayPalMode }))
              }
            >
              <option value="sandbox">Sandbox</option>
              <option value="live">Live</option>
            </select>
            <Input
              value={form.client_id}
              placeholder="PayPal client ID"
              maxLength={300}
              onChange={(event) => setForm((prev) => ({ ...prev, client_id: event.target.value }))}
            />
            <div className="grid gap-1">
              <Input
                type="password"
                value={form.client_secret ?? ""}
                placeholder={
                  paypal.data?.client_secret_set
                    ? `Client secret is set (${paypal.data.client_secret_hint})`
                    : "PayPal client secret"
                }
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, client_secret: event.target.value }))
                }
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearSecret}
                  onChange={(event) => setClearSecret(event.target.checked)}
                />
                Clear saved client secret
              </label>
            </div>
            <div className="grid gap-1">
              <Input
                value={form.webhook_id ?? ""}
                placeholder={
                  paypal.data?.webhook_id_set
                    ? `Webhook ID is set (${paypal.data.webhook_id_hint})`
                    : "PayPal webhook ID"
                }
                maxLength={300}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, webhook_id: event.target.value }))
                }
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearWebhook}
                  onChange={(event) => setClearWebhook(event.target.checked)}
                />
                Clear saved webhook ID
              </label>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/25 p-3 text-sm text-muted-foreground">
            Webhook URL: <span className="font-mono text-foreground">https://journal.ranksmedia.com/api/v1/public/webhooks/paypal</span>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              loading={savePayPal.isPending}
              disabled={!form.client_id.trim() && form.enabled}
              onClick={() =>
                void savePayPal.mutateAsync({
                  ...form,
                  clear_client_secret: clearSecret,
                  clear_webhook_id: clearWebhook,
                })
              }
            >
              Save PayPal
            </Button>
          </div>
        </div>
        <div className="grid gap-4 border-t border-border px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium">
              <CreditCard size={16} strokeWidth={1.75} />
              Whop
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={whopForm.enabled}
                onChange={(event) =>
                  setWhopForm((prev) => ({ ...prev, enabled: event.target.checked }))
                }
              />
              Enabled
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <select
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              value={whopForm.mode}
              onChange={(event) =>
                setWhopForm((prev) => ({ ...prev, mode: event.target.value as PayPalMode }))
              }
            >
              <option value="sandbox">Sandbox</option>
              <option value="live">Live</option>
            </select>
            <Input
              value={whopForm.account_id}
              placeholder="Whop account ID, e.g. biz_..."
              maxLength={120}
              onChange={(event) =>
                setWhopForm((prev) => ({ ...prev, account_id: event.target.value }))
              }
            />
            <div className="grid gap-1">
              <Input
                type="password"
                value={whopForm.api_key ?? ""}
                placeholder={
                  whop.data?.api_key_set
                    ? `API key is set (${whop.data.api_key_hint})`
                    : "Whop Account API key"
                }
                onChange={(event) =>
                  setWhopForm((prev) => ({ ...prev, api_key: event.target.value }))
                }
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearWhopKey}
                  onChange={(event) => setClearWhopKey(event.target.checked)}
                />
                Clear saved API key
              </label>
            </div>
            <div className="grid gap-1">
              <Input
                type="password"
                value={whopForm.webhook_secret ?? ""}
                placeholder={
                  whop.data?.webhook_secret_set
                    ? `Webhook secret is set (${whop.data.webhook_secret_hint})`
                    : "Whop webhook secret, e.g. ws_..."
                }
                onChange={(event) =>
                  setWhopForm((prev) => ({ ...prev, webhook_secret: event.target.value }))
                }
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearWhopSecret}
                  onChange={(event) => setClearWhopSecret(event.target.checked)}
                />
                Clear saved webhook secret
              </label>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/25 p-3 text-sm text-muted-foreground">
            Webhook URL: <span className="font-mono text-foreground">https://journal.ranksmedia.com/api/v1/public/webhooks/whop</span>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              loading={saveWhop.isPending}
              disabled={(!whopForm.account_id.trim() || !whopForm.api_key?.trim()) && whopForm.enabled && !whop.data?.api_key_set}
              onClick={() =>
                void saveWhop.mutateAsync({
                  ...whopForm,
                  clear_api_key: clearWhopKey,
                  clear_webhook_secret: clearWhopSecret,
                })
              }
            >
              Save Whop
            </Button>
          </div>
        </div>
      </SettingsGroup>
    </SettingsSection>
  );
}
