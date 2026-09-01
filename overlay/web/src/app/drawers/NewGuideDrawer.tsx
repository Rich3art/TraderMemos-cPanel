import { useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/Drawer";
import { Button } from "@/components/ui/button";
import { useToastManager } from "@/components/Toast";
import { tradesApi } from "@/lib/api/trades";
import { inferMarketFromSymbol, MARKET_LABELS } from "@/lib/marketInference";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { useCreateExecutions } from "@/lib/hooks/useExecutions";
import { useMarketBars } from "@/lib/hooks/useMarketBars";
import { usePsychologyQuestions } from "@/lib/hooks/usePsychologyQuestions";
import { useSetups } from "@/lib/hooks/useSetups";
import { buildStructuredJournalNotes } from "@/lib/journalNotes";
import { analyzeGuide, labelTimeframe, timeframeForExpectation } from "@/lib/guideAnalysis";
import { nowLocalDatetime } from "@/lib/newTradeFormSchema";
import { parseAmountToNumber } from "@/lib/amountInput";
import { wallClockToIso } from "@/lib/displayPrefs";
import { useUI } from "@/lib/ui";

const STEPS = ["Mindset", "Journal", "Trade", "Analysis", "Submit"] as const;

type GuideStep = (typeof STEPS)[number];

function numberOrNull(value: string): number | null {
  const n = parseAmountToNumber(value);
  return n != null && Number.isFinite(n) ? n : null;
}

function fieldClass() {
  return "h-10 w-full rounded-lg border border-input bg-input/50 px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";
}

function textareaClass() {
  return "min-h-24 w-full resize-y rounded-lg border border-input bg-input/50 px-3 py-2 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";
}

export function NewGuideDrawer() {
  const open = useUI((s) => s.modal === "new-guide");
  const closeModal = useUI((s) => s.closeModal);
  const toast = useToastManager();
  const queryClient = useQueryClient();
  const createExecutions = useCreateExecutions();
  const accounts = useAccounts().data ?? [];
  const setups = useSetups().data ?? [];
  const psychology = usePsychologyQuestions().data?.questions ?? [];

  const [step, setStep] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [quantity, setQuantity] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [entryAt, setEntryAt] = useState(nowLocalDatetime());
  const [target, setTarget] = useState("");
  const [stop, setStop] = useState("");
  const [setupId, setSetupId] = useState("");
  const [session, setSession] = useState("");
  const [entryReason, setEntryReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [expectation, setExpectation] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedSetup = setups.find((s) => s.id === setupId);
  const inferredMarket = inferMarketFromSymbol(symbol);
  const tf = timeframeForExpectation(expectation);
  const chartTo = useMemo(() => new Date().toISOString(), []);
  const chartFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 45);
    return d.toISOString();
  }, []);
  const barsQ = useMarketBars({
    symbol,
    instrument_type: inferredMarket,
    from: chartFrom,
    to: chartTo,
    interval: tf.primary,
    enabled: open && step >= 3 && symbol.trim().length > 0,
  });
  const analysis = useMemo(
    () =>
      analyzeGuide({
        symbol,
        instrumentType: inferredMarket,
        side,
        setupName: selectedSetup?.name ?? "",
        expectation,
        bars: barsQ.data?.bars ?? [],
      }),
    [barsQ.data?.bars, expectation, inferredMarket, selectedSetup?.name, side, symbol],
  );

  const current: GuideStep = STEPS[step]!;
  const effectiveAccountId = accountId || accounts[0]?.id || "";
  const canAdvance =
    current === "Mindset" ||
    current === "Journal" ||
    (current === "Trade" &&
      Boolean(effectiveAccountId && symbol.trim() && numberOrNull(quantity) && numberOrNull(entryPrice))) ||
    (current === "Analysis" && expectation.trim().length > 0) ||
    current === "Submit";

  function reset() {
    setStep(0);
    setAccountId("");
    setSymbol("");
    setSide("long");
    setQuantity("");
    setEntryPrice("");
    setEntryAt(nowLocalDatetime());
    setTarget("");
    setStop("");
    setSetupId("");
    setSession("");
    setEntryReason("");
    setReviewNotes("");
    setExpectation("");
    setAnswers({});
    setError("");
    setSaving(false);
  }

  function close() {
    reset();
    closeModal();
  }

  async function submit() {
    setError("");
    const qty = numberOrNull(quantity);
    const price = numberOrNull(entryPrice);
    if (!effectiveAccountId) return setError("Account is required.");
    if (!symbol.trim()) return setError("Symbol is required.");
    if (!qty || qty <= 0) return setError("Quantity must be greater than 0.");
    if (!price || price <= 0) return setError("Entry price must be greater than 0.");
    setSaving(true);
    try {
      const sym = symbol.trim().toUpperCase();
      const { bySymbol, tradeIds } = await createExecutions.mutateAsync({
        accountIds: [effectiveAccountId],
        rows: [
          {
            symbol: sym,
            instrument_type: inferredMarket,
            side: side === "long" ? "buy" : "sell",
            quantity: qty,
            price,
            fees: 0,
            commission: 0,
            executed_at: wallClockToIso(entryAt),
            multiplier: inferredMarket === "option" ? 100 : 1,
          },
        ],
      });
      const tradeId = bySymbol[sym] ?? tradeIds[0];
      if (!tradeId) throw new Error("Trade was created without an id.");
      const mindset = psychology
        .map((q, i) => `Q: ${q}\nA: ${answers[q] || answers[String(i)] || ""}`.trim())
        .filter(Boolean)
        .join("\n\n");
      const guideBody = [
        "## Guided Trade Plan",
        `Expectation: ${expectation.trim() || "Not set"}`,
        `Market: ${MARKET_LABELS[inferredMarket] ?? inferredMarket}`,
        `Setup: ${selectedSetup?.name ?? "Not selected"}`,
        `AI analysis: ${analysis.summary}`,
        mindset ? `Mindset answers:\n${mindset}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      await tradesApi.patch(tradeId, {
        notes: buildStructuredJournalNotes({
          session,
          entryReason,
          reviewNotes: [reviewNotes, guideBody].filter(Boolean).join("\n\n"),
        }),
        setup_id: setupId,
        setup_ids: setupId ? [setupId] : [],
        initial_risk: numberOrNull(stop) != null ? Math.abs(price - numberOrNull(stop)!) * qty : undefined,
        target_price: numberOrNull(target) ?? undefined,
        stop_price: numberOrNull(stop) ?? undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["trades"] });
      toast.add({ title: "Guide logged", description: `${sym} trade saved with guide analysis.` });
      close();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Save failed";
      setError(message);
      toast.add({ title: "Could not save guide", description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={(v) => !v && !saving && close()} modal="trap-focus">
      <DrawerContent className="data-[swipe-axis=x]:[--drawer-content-width:min(720px,calc(100vw-2*var(--drawer-inset)))]">
        <DrawerHeader>
          <div className="min-w-0">
            <DrawerTitle>New guide</DrawerTitle>
            <DrawerDescription>Step through mindset, journal, trade details, analysis, then log the trade.</DrawerDescription>
          </div>
          <DrawerClose aria-label="Close" className="ml-auto border-none bg-transparent p-1 text-muted-foreground hover:text-foreground">
            <X size={18} strokeWidth={1.5} />
          </DrawerClose>
        </DrawerHeader>
        <DrawerBody>
          <div className="grid grid-cols-5 gap-1 rounded-lg bg-muted/50 p-1 text-xs">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                className={`rounded-md px-2 py-2 ${i === step ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"}`}
                onClick={() => setStep(i)}
              >
                {label}
              </button>
            ))}
          </div>

          {current === "Mindset" && (
            <section className="space-y-3">
              {psychology.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No psychology questions are set yet. Add them in Settings, and they will appear here.
                </div>
              ) : (
                psychology.map((q, i) => (
                  <label key={`${q}-${i}`} className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">{q}</span>
                    <textarea className={textareaClass()} value={answers[q] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q]: e.target.value }))} />
                  </label>
                ))
              )}
            </section>
          )}

          {current === "Journal" && (
            <section className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Session</span>
                <input className={fieldClass()} value={session} onChange={(e) => setSession(e.target.value)} placeholder="London, New York, Asia..." />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Entry reason</span>
                <textarea className={textareaClass()} value={entryReason} onChange={(e) => setEntryReason(e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Review notes</span>
                <textarea className={textareaClass()} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
              </label>
            </section>
          )}

          {current === "Trade" && (
            <section className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Account</span>
                <select className={fieldClass()} value={effectiveAccountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Symbol</span>
                <input className={fieldClass()} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="EURUSD, AAPL, BTCUSDT" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Side</span>
                <select className={fieldClass()} value={side} onChange={(e) => setSide(e.target.value as "long" | "short")}>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Market</span>
                <input className={fieldClass()} value={MARKET_LABELS[inferredMarket] ?? inferredMarket} readOnly />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Quantity</span>
                <input className={fieldClass()} value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Entry price</span>
                <input className={fieldClass()} value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Target</span>
                <input className={fieldClass()} value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Stop</span>
                <input className={fieldClass()} value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal" />
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">Setup</span>
                <select className={fieldClass()} value={setupId} onChange={(e) => setSetupId(e.target.value)}>
                  <option value="">No setup selected</option>
                  {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">Entry time</span>
                <input className={fieldClass()} value={entryAt} onChange={(e) => setEntryAt(e.target.value)} type="datetime-local" />
              </label>
            </section>
          )}

          {current === "Analysis" && (
            <section className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Expected time to become profitable</span>
                <input className={fieldClass()} value={expectation} onChange={(e) => setExpectation(e.target.value)} placeholder="Example: 3 to 5 days" />
              </label>
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <div className="mb-2 flex items-center gap-2 font-medium"><Bot size={16} /> Guide analysis</div>
                <p className="whitespace-pre-line text-muted-foreground">{analysis.summary}</p>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <span>Main: {labelTimeframe(analysis.primaryTimeframe)}</span>
                  <span>Higher: {labelTimeframe(analysis.higherTimeframe)}</span>
                  <span>Bars: {barsQ.data?.bars.length ?? 0}</span>
                </div>
              </div>
            </section>
          )}

          {current === "Submit" && (
            <section className="space-y-3 text-sm">
              <div className="rounded-lg border border-border p-4">
                <div className="font-medium">{symbol.trim().toUpperCase() || "Symbol"} {side}</div>
                <div className="mt-1 text-muted-foreground">Probability estimate: {analysis.probability}% · {analysis.bias}</div>
                <div className="mt-1 text-muted-foreground">Recommended timeframe: {labelTimeframe(analysis.primaryTimeframe)}, then check {labelTimeframe(analysis.higherTimeframe)}.</div>
              </div>
            </section>
          )}

          {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        </DrawerBody>
        <DrawerFooter className="justify-between">
          <Button variant="outline" disabled={step === 0 || saving} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            <ChevronLeft size={16} /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button disabled={!canAdvance || saving} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Next <ChevronRight size={16} />
            </Button>
          ) : (
            <Button disabled={!canAdvance || saving} loading={saving} onClick={() => void submit()}>
              <Check size={16} /> Submit guide
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
