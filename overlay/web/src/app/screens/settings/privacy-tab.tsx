import { Download, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useToastManager } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { authApi } from "@/lib/api/auth";
import { feedbackApi } from "@/lib/api/feedback";
import { useAuth } from "@/lib/auth";
import {
  FormError,
  SettingsGroup,
  SettingsGroupRow,
  SettingsPanelBody,
  SettingsSection,
} from "./settings-ui";

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function PrivacyTab() {
  const toast = useToastManager();
  const navigate = useNavigate();
  const signOut = useAuth((s) => s.signOut);
  const [exporting, setExporting] = useState(false);
  const [requestBody, setRequestBody] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setExporting(true);
    try {
      const response = await authApi.exportMyData();
      if (!response.ok) throw new Error("Could not export your data.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tradermemos-my-data-${timestampForFilename()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.add({ title: "Data export downloaded" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export your data.");
    } finally {
      setExporting(false);
    }
  }

  async function handleCorrectionRequest() {
    const body = requestBody.trim();
    if (!body) {
      setError("Enter the correction or data-management request first.");
      return;
    }
    setError(null);
    setRequesting(true);
    try {
      await feedbackApi.create({ body, page: "privacy-my-data" });
      setRequestBody("");
      toast.add({ title: "Privacy request submitted" });
    } catch {
      setError("Could not submit the privacy request.");
    } finally {
      setRequesting(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await authApi.deleteMyData(confirmation);
      toast.add({ title: "Account deleted" });
      signOut();
      navigate({ to: "/login", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete your account.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <SettingsSection
        title="Export my data"
        description="Download a JSON copy of your profile, trading accounts, trades, setups, playbooks, journal records, feedback, preferences, reminders, subscriptions, and payment metadata."
      >
        <SettingsGroup>
          <SettingsGroupRow
            label="My data export"
            detail="Credentials and private secrets are excluded from the export."
          >
            <Button type="button" onClick={handleExport} disabled={exporting}>
              <Download size={14} strokeWidth={1.75} />
              {exporting ? "Preparing..." : "Download JSON"}
            </Button>
          </SettingsGroupRow>
        </SettingsGroup>
      </SettingsSection>

      <SettingsSection
        title="Data correction request"
        description="Ask for a correction or data-management review. The request is saved with your account for admin follow-up."
      >
        <SettingsPanelBody className="grid gap-3">
          <Textarea
            value={requestBody}
            onChange={(event) => setRequestBody(event.target.value)}
            placeholder="Describe what should be corrected or reviewed..."
            rows={5}
          />
          <div className="flex justify-end">
            <Button type="button" onClick={handleCorrectionRequest} disabled={requesting}>
              <Send size={14} strokeWidth={1.75} />
              {requesting ? "Submitting..." : "Submit request"}
            </Button>
          </div>
        </SettingsPanelBody>
      </SettingsSection>

      <SettingsSection
        title="Danger Zone"
        description="Permanently delete your account and all trade data. This cannot be undone."
      >
        <SettingsPanelBody className="grid gap-4 border-destructive/40 bg-destructive/5">
          <div className="grid gap-2">
            <label className="text-[12px] font-medium text-foreground" htmlFor="delete-confirm">
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirm"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={confirmation !== "DELETE" || deleting}
            >
              <Trash2 size={14} strokeWidth={1.75} />
              {deleting ? "Deleting..." : "Permanently delete account"}
            </Button>
          </div>
        </SettingsPanelBody>
      </SettingsSection>
      <FormError message={error} />
    </div>
  );
}
