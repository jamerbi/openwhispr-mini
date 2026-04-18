import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { BarChart2, Mic, Brain, RefreshCw, Trash2, Clock, FileText, Zap } from "lucide-react";
import {
  SectionHeader,
  SettingsPanel,
  SettingsPanelRow,
} from "../ui/SettingsSection";
import { Button } from "../ui/button";

type Period = "today" | "week" | "month" | "all";

interface UsageTotals {
  event_type: string;
  provider: string | null;
  event_count: number;
  total_words: number;
  total_chars: number;
  total_audio_ms: number | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
}

interface DailyEntry {
  day: string;
  event_type: string;
  event_count: number;
  total_words: number;
  total_audio_ms: number | null;
  total_tokens: number;
  total_cost_usd: number;
}

interface UsageStats {
  totals: UsageTotals[];
  daily: DailyEntry[];
}

function formatMs(ms: number | null): string {
  if (!ms) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return "<$0.001";
  return `$${usd.toFixed(4)}`;
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  all: "All Time",
};

export default function UsageStatsPanel() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("today");
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loadStats = useCallback(async () => {
    if (!window.electronAPI?.usageGetStats) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.usageGetStats({ period });
      setStats(result ?? null);
    } catch {
      // silently skip — non-blocking
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleReset = async () => {
    if (!window.electronAPI?.usageResetStats) return;
    if (!confirm("Are you sure you want to clear all usage history? This cannot be undone.")) return;
    setResetting(true);
    try {
      await window.electronAPI.usageResetStats();
      setStats({ totals: [], daily: [] });
    } finally {
      setResetting(false);
    }
  };

  // Aggregate summaries
  const transcriptionTotals = stats?.totals.filter((t) => t.event_type === "transcription") ?? [];
  const aiTotals = stats?.totals.filter((t) => t.event_type !== "transcription") ?? [];

  const totalWords = transcriptionTotals.reduce((s, t) => s + (t.total_words || 0), 0);
  const totalAudioMs = transcriptionTotals.reduce((s, t) => s + (t.total_audio_ms || 0), 0);
  const totalTranscriptions = transcriptionTotals.reduce((s, t) => s + (t.event_count || 0), 0);

  const totalInputTokens = aiTotals.reduce((s, t) => s + (t.total_input_tokens || 0), 0);
  const totalOutputTokens = aiTotals.reduce((s, t) => s + (t.total_output_tokens || 0), 0);
  const totalCost = stats?.totals.reduce((s, t) => s + (t.total_cost_usd || 0), 0) ?? 0;

  // Build daily bar chart data (last 7 or 30 days worth from results)
  const dailyByDate = (stats?.daily ?? []).reduce<
    Record<string, { words: number; tokens: number; audioMs: number }>
  >((map, entry) => {
    if (!map[entry.day]) map[entry.day] = { words: 0, tokens: 0, audioMs: 0 };
    map[entry.day].words += entry.total_words || 0;
    map[entry.day].tokens += entry.total_tokens || 0;
    map[entry.day].audioMs += entry.total_audio_ms || 0;
    return map;
  }, {});

  const dailyEntries = Object.entries(dailyByDate)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-14); // show last 14 days max

  const maxWords = Math.max(...dailyEntries.map(([, d]) => d.words), 1);

  const hasData = (stats?.totals.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <SectionHeader
        title="Usage Statistics"
        description="Track how many words, tokens, and audio minutes you've processed. Logged locally, never sent anywhere."
      />

      {/* Period tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-lg w-fit">
        {(["today", "week", "month", "all"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 text-xs rounded-md transition-all font-medium ${
              period === p
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
        <button
          onClick={loadStats}
          disabled={loading}
          className="ml-1 p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Transcription card */}
        <SettingsPanel>
          <SettingsPanelRow>
            <div className="flex items-start gap-3 py-1">
              <div className="shrink-0 w-8 h-8 rounded-md bg-blue-500/10 flex items-center justify-center">
                <Mic size={16} className="text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground mb-1">Transcription</p>
                <p className="text-xl font-bold text-foreground tabular-nums">
                  {totalWords.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">words transcribed</p>
                <div className="mt-2 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock size={10} />
                    <span>{formatMs(totalAudioMs)} audio</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText size={10} />
                    <span>{totalTranscriptions} sessions</span>
                  </div>
                </div>
              </div>
            </div>
          </SettingsPanelRow>
        </SettingsPanel>

        {/* AI tokens card */}
        <SettingsPanel>
          <SettingsPanelRow>
            <div className="flex items-start gap-3 py-1">
              <div className="shrink-0 w-8 h-8 rounded-md bg-violet-500/10 flex items-center justify-center">
                <Brain size={16} className="text-violet-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground mb-1">AI Tokens</p>
                <p className="text-xl font-bold text-foreground tabular-nums">
                  {(totalInputTokens + totalOutputTokens).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">total tokens</p>
                <div className="mt-2 flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Zap size={10} />
                    <span>in {totalInputTokens.toLocaleString()} / out {totalOutputTokens.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BarChart2 size={10} />
                    <span>est. {formatCost(totalCost)}</span>
                  </div>
                </div>
              </div>
            </div>
          </SettingsPanelRow>
        </SettingsPanel>
      </div>

      {/* Daily bar chart */}
      {dailyEntries.length > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground mb-3">Words per day</p>
          <div className="flex items-end gap-1 h-16">
            {dailyEntries.map(([day, data]) => {
              const pct = Math.max((data.words / maxWords) * 100, 2);
              const label = new Date(day + "T12:00:00").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });
              return (
                <div
                  key={day}
                  className="flex-1 flex flex-col items-center gap-1 group relative"
                  title={`${label}: ${data.words.toLocaleString()} words`}
                >
                  <div className="w-full flex items-end" style={{ height: 52 }}>
                    <div
                      className="w-full rounded-sm bg-primary/60 group-hover:bg-primary transition-colors"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  {dailyEntries.length <= 7 && (
                    <span className="text-[9px] text-muted-foreground/60 truncate w-full text-center">
                      {label.split(" ")[1]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-provider breakdown */}
      {hasData && stats!.totals.length > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground mb-2">By provider</p>
          <SettingsPanel>
            {stats!.totals.map((row, i) => (
              <SettingsPanelRow key={i}>
                <div className="flex items-center justify-between w-full">
                  <div>
                    <p className="text-xs font-medium text-foreground capitalize">
                      {row.provider || "local"}{" "}
                      <span className="text-muted-foreground font-normal">({row.event_type})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.event_count} sessions · {(row.total_words || 0).toLocaleString()} words
                      {row.total_audio_ms ? ` · ${formatMs(row.total_audio_ms)}` : ""}
                    </p>
                  </div>
                  {row.total_cost_usd > 0 && (
                    <p className="text-xs font-medium text-foreground tabular-nums">
                      {formatCost(row.total_cost_usd)}
                    </p>
                  )}
                </div>
              </SettingsPanelRow>
            ))}
          </SettingsPanel>
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasData && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <BarChart2 size={32} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No usage data yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Start transcribing to see your stats here.
          </p>
        </div>
      )}

      {/* Reset button */}
      {hasData && (
        <div className="flex justify-end pt-2 border-t border-border/40">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-destructive/70 hover:text-destructive gap-1.5"
            onClick={handleReset}
            disabled={resetting}
          >
            <Trash2 size={12} />
            Clear usage history
          </Button>
        </div>
      )}
    </div>
  );
}
