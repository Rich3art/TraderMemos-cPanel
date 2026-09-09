import { DatabaseZap, KeyRound, Newspaper } from "lucide-react";
import { useEffect, useState } from "react";
import { FormInput } from "@/components/FormInput";
import { FormSkeleton } from "@/components/skeletons/form-skeleton";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type {
  CommercialNewsProvider,
  CommercialPaidProvider,
} from "@/lib/api/settings";
import {
  useCommercialFeedSettings,
  useSaveCommercialFeedSettings,
} from "@/lib/hooks/useCommercialFeedSettings";
import {
  SettingsCard,
  SettingsCardNote,
  SettingsCardRow,
  SettingsSection,
} from "./settings-ui";

const PAID_PROVIDERS: { value: CommercialPaidProvider; label: string }[] = [
  { value: "", label: "Choose later" },
  { value: "newsapi", label: "NewsAPI" },
  { value: "finnhub", label: "Finnhub" },
  { value: "mediastack", label: "Mediastack" },
  { value: "custom", label: "Custom licensed API" },
];

export function CommercialFeedTab() {
  const { data, isPending, isError } = useCommercialFeedSettings();
  const save = useSaveCommercialFeedSettings();
  const [newsProvider, setNewsProvider] = useState<CommercialNewsProvider>("public");
  const [paidProvider, setPaidProvider] = useState<CommercialPaidProvider>("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [licenseNote, setLicenseNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!data) return;
    setNewsProvider(data.news_provider || "public");
    setPaidProvider(data.paid_provider || "");
    setApiBaseUrl(data.api_base_url || "");
    setLicenseNote(data.license_note || "");
    setApiKey("");
  }, [data]);

  async function handleSave() {
    setError("");
    try {
      await save.mutateAsync({
        news_provider: newsProvider,
        paid_provider: paidProvider,
        api_base_url: apiBaseUrl,
        license_note: licenseNote,
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      });
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save commercial feed settings.");
    }
  }

  return (
    <SettingsSection
      title="Commercial Feed"
      footer="Use this to keep the current public headline/link feed active now, while preparing paid commercial news credentials for a future licensed provider integration."
    >
      {isPending && !data ? (
        <SettingsCard title="News feed source">
          <FormSkeleton fields={4} />
        </SettingsCard>
      ) : isError || !data ? (
        <SettingsCard title="News feed source">
          <SettingsCardNote tone="destructive">
            Failed to load commercial feed settings.
          </SettingsCardNote>
        </SettingsCard>
      ) : (
        <SettingsCard
          title="News feed source"
          description="The current News page uses the public headline/link source. Paid commercial API details can be saved here without exposing the secret key to the browser."
        >
          <SettingsCardRow
            icon={Newspaper}
            active={newsProvider === "public"}
            label="Active News feed"
            detail="Choose the public feed now, or mark a paid commercial provider as the preferred future source."
          >
            <NativeSelect
              value={newsProvider}
              onChange={(event) => setNewsProvider(event.target.value as CommercialNewsProvider)}
              aria-label="Active News feed"
              className="w-[220px]"
            >
              <NativeSelectOption value="public">Public headline/link feed</NativeSelectOption>
              <NativeSelectOption value="paid">Paid commercial feed</NativeSelectOption>
            </NativeSelect>
          </SettingsCardRow>
          <SettingsCardRow
            icon={DatabaseZap}
            active={newsProvider === "paid"}
            label="Paid provider"
            detail="Provider-specific fetching is not enabled yet; these settings prepare the app for that later work."
          >
            <NativeSelect
              value={paidProvider}
              onChange={(event) => setPaidProvider(event.target.value as CommercialPaidProvider)}
              aria-label="Paid provider"
              className="w-[220px]"
            >
              {PAID_PROVIDERS.map((provider) => (
                <NativeSelectOption key={provider.value || "none"} value={provider.value}>
                  {provider.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </SettingsCardRow>
          <div className="grid gap-3 px-5 py-3 md:grid-cols-2">
            <label className="block text-[12px] font-medium text-foreground">
              Commercial API base URL
              <FormInput
                className="mt-1"
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                placeholder="https://api.example.com"
              />
            </label>
            <label className="block text-[12px] font-medium text-foreground">
              API key
              <FormInput
                className="mt-1"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  data.api_key_set
                    ? `${data.api_key_hint || "Key saved"} - leave blank to keep`
                    : "Paste key when ready"
                }
                type="password"
              />
            </label>
          </div>
          <div className="px-5 py-3">
            <label className="block text-[12px] font-medium text-foreground">
              Commercial license note
            </label>
            <textarea
              value={licenseNote}
              onChange={(event) => setLicenseNote(event.target.value)}
              className="mt-1 min-h-[92px] w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
              placeholder="Record the provider plan, license status, attribution rules, or renewal notes."
            />
          </div>
          <SettingsCardRow
            icon={KeyRound}
            label="Secret handling"
            detail="Saved API keys remain on the API server. The frontend only receives whether a key exists and a masked hint."
          >
            <Button type="button" onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
          </SettingsCardRow>
          {error ? <SettingsCardNote tone="destructive">{error}</SettingsCardNote> : null}
          {newsProvider === "paid" ? (
            <SettingsCardNote>
              Paid feed integration is prepared but not active yet. Keep the public feed selected until
              we add the selected provider's request and licensing-specific display rules.
            </SettingsCardNote>
          ) : (
            <SettingsCardNote>
              The public feed should only show headlines, short excerpts, source names, timestamps and
              links back to original sources.
            </SettingsCardNote>
          )}
        </SettingsCard>
      )}
    </SettingsSection>
  );
}
