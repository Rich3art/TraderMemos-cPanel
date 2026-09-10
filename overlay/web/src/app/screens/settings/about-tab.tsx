import { ExternalLink, Save, Server, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { MarkdownBody } from "@/components/MarkdownBody";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Skeleton } from "@/components/Skeleton";
import { useToastManager } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ContentLink } from "@/lib/api/types";
import { getBaseUrl } from "@/lib/api/client";
import { formatUptime, useSystemInfo } from "@/lib/hooks/useSystemInfo";
import { useMe } from "@/lib/hooks/useMe";
import { useContentPage, useUpdateContentPage } from "@/lib/hooks/useContent";
import { APP_BUILD, APP_VERSION, formatVersion } from "@/lib/version";
import { SettingsGroup, SettingsGroupRow, SettingsSection } from "./settings-ui";

type AboutForm = {
  title: string;
  summary: string;
  body: string;
  image_url: string;
  links: ContentLink[];
};

const EMPTY_FORM: AboutForm = {
  title: "",
  summary: "",
  body: "",
  image_url: "",
  links: [],
};

function parseLinksInput(value: string): ContentLink[] {
  return value
    .split(/\r?\n/)
    .map((line) => {
      const [label, ...urlParts] = line.split("|");
      return { label: label?.trim() ?? "", url: urlParts.join("|").trim() };
    })
    .filter((link) => link.label && link.url);
}

function formatLinksInput(links: ContentLink[]): string {
  return links.map((link) => `${link.label} | ${link.url}`).join("\n");
}

function AboutPreview({ form }: { form: AboutForm }) {
  return (
    <article className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
      {form.image_url ? (
        <div className="aspect-[16/6] overflow-hidden bg-muted">
          <img src={form.image_url} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="grid gap-5 p-5">
        <div className="space-y-2">
          <h2 className="m-0 text-xl font-semibold tracking-tight text-foreground">
            {form.title || "About TraderMemo"}
          </h2>
          {form.summary ? (
            <p className="m-0 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
              {form.summary}
            </p>
          ) : null}
        </div>
        {form.body ? <MarkdownBody markdown={form.body} className="text-sm" /> : null}
        {form.links.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {form.links.map((link) => (
              <a
                key={`${link.label}:${link.url}`}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-[13px] font-medium text-foreground no-underline hover:bg-accent"
              >
                {link.label}
                <ExternalLink size={13} strokeWidth={1.75} />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function LocalSystemInfo() {
  const info = useSystemInfo();
  return (
    <SettingsSection
      title="Local system"
      description="This is your self-hosted TraderMemo backend and web build information."
    >
      <SettingsGroup>
        <SettingsGroupRow label="API base URL">
          <span className="text-sm text-foreground">{getBaseUrl()}</span>
        </SettingsGroupRow>
        <SettingsGroupRow label="Web build">
          <span className="text-sm text-foreground">
            {formatVersion(APP_VERSION, APP_BUILD || undefined)}
          </span>
        </SettingsGroupRow>
        <SettingsGroupRow label="API version">
          {info.isLoading ? (
            <Skeleton width="5rem" height="1rem" />
          ) : (
            <span className="text-sm text-foreground">{info.data?.version || "Unavailable"}</span>
          )}
        </SettingsGroupRow>
        <SettingsGroupRow label="Database">
          <span className="text-sm text-foreground">
            {info.data?.db_driver || (info.isLoading ? "Checking..." : "Unavailable")}
          </span>
        </SettingsGroupRow>
        <SettingsGroupRow label="Uptime">
          <span className="text-sm text-foreground">
            {info.data
              ? formatUptime(info.data.uptime_sec)
              : info.isLoading
                ? "Checking..."
                : "Unavailable"}
          </span>
        </SettingsGroupRow>
      </SettingsGroup>
    </SettingsSection>
  );
}

export function AboutTab() {
  const toast = useToastManager();
  const me = useMe();
  const isAdmin = Boolean(me.data?.is_admin);
  const about = useContentPage("about");
  const updateAbout = useUpdateContentPage("about");
  const [form, setForm] = useState<AboutForm>(EMPTY_FORM);
  const [linksInput, setLinksInput] = useState("");

  useEffect(() => {
    if (!about.data) return;
    const next = {
      title: about.data.title,
      summary: about.data.summary,
      body: about.data.body,
      image_url: about.data.image_url,
      links: about.data.links ?? [],
    };
    setForm(next);
    setLinksInput(formatLinksInput(next.links));
  }, [about.data]);

  async function save() {
    const links = parseLinksInput(linksInput);
    try {
      await updateAbout.mutateAsync({ ...form, links });
      setForm((prev) => ({ ...prev, links }));
      toast.add({ title: "About page updated" });
    } catch (err) {
      toast.add({
        title: "Could not update About page",
        description: err instanceof Error ? err.message : "Request failed",
      });
    }
  }

  if (about.isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton height="13rem" />
        <Skeleton height="9rem" />
      </div>
    );
  }

  if (about.isError) {
    return <EmptyState title="Could not load About page" hint="Try refreshing the page." />;
  }

  return (
    <div className="grid gap-6">
      <AboutPreview form={form} />

      {isAdmin ? (
        <Card
          title="Edit About page"
          description="This content is stored on your server and is no longer tied to the original TraderMemos repository or release system."
        >
          <div className="grid gap-3">
            <Input
              aria-label="About title"
              value={form.title}
              maxLength={180}
              placeholder="About title"
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
            <Textarea
              aria-label="About summary"
              value={form.summary}
              maxLength={500}
              rows={2}
              placeholder="Short summary"
              onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
            />
            <RichTextEditor
              value={form.body}
              onChange={(body) => setForm((prev) => ({ ...prev, body }))}
              minHeight={180}
              placeholder="About page content..."
            />
            <Input
              aria-label="Hero image URL"
              value={form.image_url}
              maxLength={800}
              placeholder="Image URL, optional"
              onChange={(event) => setForm((prev) => ({ ...prev, image_url: event.target.value }))}
            />
            <Textarea
              aria-label="About links"
              value={linksInput}
              rows={3}
              placeholder={"Link label | https://example.com\nAnother link | https://example.com/page"}
              onChange={(event) => setLinksInput(event.target.value)}
            />
            <div className="flex justify-end">
              <Button type="button" disabled={updateAbout.isPending || !form.title.trim()} onClick={save}>
                <Save size={14} strokeWidth={1.75} />
                {updateAbout.isPending ? "Saving..." : "Save About page"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Developer" description="Editable site ownership details live in the About content above.">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UserRound size={18} strokeWidth={1.75} />
            </span>
            <p className="m-0">
              This deployment is maintained by your self-hosted TraderMemo workspace.
            </p>
          </div>
        </Card>
        <Card title="Backend API" description="This is the local API your journal is using.">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Server size={18} strokeWidth={1.75} />
            </span>
            <p className="m-0">
              The backend API is required for authentication, journal data, imports, analytics,
              settings, uploads, and server-side security checks.
            </p>
          </div>
        </Card>
      </div>

      <LocalSystemInfo />
    </div>
  );
}
