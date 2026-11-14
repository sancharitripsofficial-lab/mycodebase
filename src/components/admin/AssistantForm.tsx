"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ArrowDown, ArrowUp, ImagePlus, MessageCircle, Phone, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { MediaLibrary } from "@/components/admin/MediaLibrary";
import { Notice } from "@/components/admin/kit";
import { assistantSettingsSchema, isSafeGuideMediaLink } from "@/lib/admin/content-schemas";
import { DEFAULT_ASSISTANT_SETTINGS, displayPhone, mergeAssistantSettings, type AssistantSettings } from "@/lib/assistant/settings";
import { GUIDE_EMOTIONS, type GuideEmotion } from "@/lib/assistant/types";

type SaveFn = (action: string, data: unknown) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;

const MAX_QUESTIONS = 8;

/** What each picture/video of the guide should show. */
const EMOTION_HINTS: Record<GuideEmotion, { label: string; hint: string }> = {
  idle: { label: "Idle", hint: "Idle — standing, friendly, breathing (loop video or photo). Used whenever another emotion is empty." },
  wave: { label: "Wave", hint: "Wave — waving hello when the chat opens." },
  listening: { label: "Listening", hint: "Listening — leaning in, small nod, while the visitor types." },
  thinking: { label: "Thinking", hint: "Thinking — hand on chin or checking a map, while the answer loads." },
  talking: { label: "Talking", hint: "Talking — speaking with natural hand gestures while the answer appears." },
  happy: { label: "Happy", hint: "Happy — warm smile or thumbs up, for good news (seats free, booking found)." },
  sorry: { label: "Sorry", hint: "Sorry — apologetic, hand on heart, when a date is full or the guide is not sure." },
  pointing: { label: "Pointing", hint: "Pointing — pointing to the side or at a map, when showing trips, dates or links." },
};

const FIELD_LABELS: Record<string, string> = {
  guideName: "Guide name",
  guideRole: "Line under the name",
  greeting: "Greeting",
  customerCareNumber: "Customer care number",
  customerCareHours: "Customer care hours",
  quickQuestions: "Quick questions",
  guideMedia: "Guide pictures & videos",
};

const isVideoLink = (url: string) => /\.(mp4|webm)(\?|#|$)/i.test(url);

/** First problem in plain words, e.g. "Quick question 3: Each quick question needs at least 3 characters". */
function describeIssue(path: (string | number)[], message: string): string {
  const [field, sub] = path;
  if (field === "quickQuestions" && typeof sub === "number") return `Quick question ${sub + 1}: ${message}`;
  if (field === "guideMedia" && typeof sub === "string" && sub in EMOTION_HINTS) return `${EMOTION_HINTS[sub as GuideEmotion].label}: ${message}`;
  const label = typeof field === "string" ? FIELD_LABELS[field] : undefined;
  return label && !message.toLowerCase().startsWith(label.toLowerCase()) ? `${label}: ${message}` : message;
}

function move<T>(list: T[], i: number, d: number): T[] {
  const next = list.slice();
  const t = i + d;
  if (t < 0 || t >= next.length) return next;
  [next[i], next[t]] = [next[t], next[i]];
  return next;
}

function Group({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-cream-50 p-4">
      <div>
        <h3 className="font-semibold text-ink-900">{title}</h3>
        {hint && <p className="text-xs text-stone-600">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Small square preview of a picture or a silent looping video. */
function MediaPreview({ url, size = "h-20 w-20" }: { url: string; size?: string }) {
  if (!url) {
    return (
      <div className={`${size} flex shrink-0 items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white text-[10px] text-stone-600`}>
        Empty
      </div>
    );
  }
  if (!isSafeGuideMediaLink(url)) {
    return (
      <div className={`${size} flex shrink-0 items-center justify-center rounded-xl border border-[#f3c4c4] bg-[#fdecec] p-1 text-center text-[10px] text-[#9b1c1c]`}>
        Link not usable
      </div>
    );
  }
  return isVideoLink(url) ? (
    <video src={url} muted loop autoPlay playsInline preload="metadata" className={`${size} shrink-0 rounded-xl border border-stone-200 bg-cream-100 object-cover`} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- admin preview of any pasted link
    <img src={url} alt="" loading="lazy" className={`${size} shrink-0 rounded-xl border border-stone-200 bg-cream-100 object-cover`} />
  );
}

/** How the top of the chat window will look with these settings (rough preview, not the real widget). */
function ChatPreview({ f }: { f: AssistantSettings }) {
  const avatar = f.guideMedia.wave || f.guideMedia.idle || "";
  const care = /^91[1-9]\d{9}$/.test(f.customerCareNumber) ? displayPhone(f.customerCareNumber) : "";
  const questions = f.quickQuestions.map((q) => q.trim()).filter(Boolean).slice(0, 4);
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 bg-gradient-to-r from-forest-900 to-lagoon-500 px-4 py-3 text-white">
        {avatar && isSafeGuideMediaLink(avatar) ? (
          <MediaPreview url={avatar} size="h-12 w-12" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold">
            {(f.guideName.trim() || "G").slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold">{f.guideName.trim() || "Guide name"}</p>
          <p className="truncate text-xs text-white/85">{f.guideRole.trim() || "Line under the name"}</p>
        </div>
      </div>
      <div className="space-y-2 bg-cream-100 p-3">
        <p className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-ink-900 shadow-sm">
          {f.greeting.trim() || "Greeting…"}
        </p>
        {questions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {questions.map((q, i) => (
              <span key={i} className="rounded-full border border-forest-800/30 bg-white px-2.5 py-1 text-xs font-medium text-forest-900">
                {q}
              </span>
            ))}
          </div>
        )}
        {care ? (
          <p className="flex flex-wrap items-center gap-2 pt-1 text-xs text-stone-600">
            <span className="inline-flex items-center gap-1 rounded-full bg-copper-600 px-3 py-1 font-semibold text-white">
              <Phone className="h-3.5 w-3.5" /> Call {care}
            </span>
            {f.customerCareHours.trim() && <span>{f.customerCareHours.trim()}</span>}
          </p>
        ) : (
          <p className="pt-1 text-xs text-stone-600">No customer care number — the Call button is hidden.</p>
        )}
      </div>
      {!f.enabled && <p className="bg-peach-100 px-3 py-2 text-xs font-semibold text-copper-700">Switched off: visitors do not see the chat.</p>}
    </div>
  );
}

function CareNumberHelp({ digits, whatsappNumber, canEdit, onUse }: { digits: string; whatsappNumber: string; canEdit: boolean; onUse: (v: string) => void }) {
  const valid = /^91[1-9]\d{9}$/.test(digits);
  const wa = /^91[6-9]\d{9}$/.test(whatsappNumber) ? whatsappNumber : "";
  return (
    <div className="space-y-2 text-xs">
      {digits === "" && <p className="text-stone-600">Empty: the chat shows no Call button.</p>}
      {valid && (
        <p className="text-forest-900">
          Visitors see a <strong>Call {displayPhone(digits)}</strong> button.
        </p>
      )}
      {digits !== "" && !valid && (
        <p className="rounded-lg bg-[#fdecec] px-2.5 py-1.5 text-[#9b1c1c]">
          Needs 91 followed by the 10-digit number (12 digits). You have typed {digits.length} digit{digits.length === 1 ? "" : "s"}.
        </p>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {/^[1-9]\d{9}$/.test(digits) && <Button size="sm" label={`Add 91 in front (91${digits})`} onClick={() => onUse(`91${digits}`)} />}
          {/^0[1-9]\d{9}$/.test(digits) && <Button size="sm" label={`Use 91${digits.slice(1)}`} onClick={() => onUse(`91${digits.slice(1)}`)} />}
          {wa && wa !== digits && <Button size="sm" variant="ghost" label={`Same as WhatsApp (${displayPhone(wa)})`} onClick={() => onUse(wa)} />}
        </div>
      )}
    </div>
  );
}

/**
 * Admin → Website text → Chat guide. Saved as the `assistant` site setting; the website chat reads it
 * on the next question (live data cache is a few seconds).
 */
export function AssistantForm({
  initial,
  aiReady,
  whatsappNumber = "",
  save,
  canEdit,
}: {
  initial: AssistantSettings | undefined;
  aiReady: boolean;
  whatsappNumber?: string;
  save: SaveFn;
  canEdit: boolean;
}) {
  const [f, setF] = useState<AssistantSettings>(() => mergeAssistantSettings(initial));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [picker, setPicker] = useState<GuideEmotion | null>(null);
  const set = <K extends keyof AssistantSettings>(k: K, v: AssistantSettings[K]) => setF((x) => ({ ...x, [k]: v }));
  const setMedia = (e: GuideEmotion, url: string) => setF((x) => ({ ...x, guideMedia: { ...x.guideMedia, [e]: url } }));
  const filledMedia = GUIDE_EMOTIONS.filter((e) => (f.guideMedia[e] ?? "").trim()).length;

  async function onSave() {
    setNotice(null);
    // Blank rows are dropped before saving; remember where each kept row sits on screen, so an
    // error names the row the owner actually sees ("Question 3"), not its position after the drop.
    const kept = f.quickQuestions.map((q, i) => ({ q: q.trim(), row: i })).filter((x) => x.q);
    const draft = { ...f, quickQuestions: kept.map((x) => x.q) };
    const parsed = assistantSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue ? [...issue.path] : [];
      if (path[0] === "quickQuestions" && typeof path[1] === "number") path[1] = kept[path[1]]?.row ?? path[1];
      setNotice({ kind: "error", text: issue ? describeIssue(path as (string | number)[], issue.message) : "Please check the form." });
      return;
    }
    setBusy(true);
    const r = await save("settings.save", { key: "assistant", value: parsed.data });
    setBusy(false);
    if (r.ok) setF(mergeAssistantSettings(parsed.data));
    setNotice(r.ok ? { kind: "ok", text: r.message } : { kind: "error", text: r.error });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Group title="The guide" hint="The chat button on every public page opens a chat with this guide. Answers come from your live trips, dates, seats, prices, pickup points and policies.">
          <Switch
            label="Show the chat guide on the website"
            description="Switch off to hide the chat button everywhere."
            value={f.enabled}
            isDisabled={!canEdit}
            onChange={(v) => set("enabled", v)}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput
              label="Guide name"
              description="2–40 characters. Shown at the top of the chat."
              placeholder="Ravi"
              value={f.guideName}
              isDisabled={!canEdit}
              onChange={(v) => set("guideName", v)}
            />
            <TextInput
              label="Line under the name"
              description="Up to 80 characters."
              placeholder="Your Sanchari trip guide"
              value={f.guideRole}
              isDisabled={!canEdit}
              onChange={(v) => set("guideRole", v)}
            />
          </div>
          <TextArea
            label="Greeting (first message)"
            description={`${f.greeting.trim().length}/400 characters. Say what the guide can help with.`}
            rows={3}
            value={f.greeting}
            isDisabled={!canEdit}
            onChange={(v) => set("greeting", v)}
          />
        </Group>
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
            <MessageCircle className="h-4 w-4" /> Preview (rough)
          </p>
          <ChatPreview f={f} />
        </div>
      </div>

      <Group title="Customer care" hint="Visitors can call this number from the chat. Leave it empty to hide the Call button.">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <TextInput
              type="tel"
              inputMode="numeric"
              label="Customer care number"
              description="Shown in the chat as a Call button. 91 + 10 digits."
              placeholder="919876543210"
              value={f.customerCareNumber}
              isDisabled={!canEdit}
              onChange={(v) => set("customerCareNumber", v.replace(/\D/g, ""))}
            />
            <CareNumberHelp digits={f.customerCareNumber} whatsappNumber={whatsappNumber} canEdit={canEdit} onUse={(v) => set("customerCareNumber", v)} />
          </div>
          <TextInput
            label="When customer care answers"
            description="Shown next to the Call button. Up to 80 characters."
            placeholder="Mon–Sun, 9 AM – 8 PM"
            value={f.customerCareHours}
            isDisabled={!canEdit}
            onChange={(v) => set("customerCareHours", v)}
          />
        </div>
      </Group>

      <Group
        title={`Quick question buttons (${f.quickQuestions.length}/${MAX_QUESTIONS})`}
        hint="Tap-to-ask buttons under the greeting. Keep them short (3–80 characters). Empty lines are left out when you save."
      >
        {f.quickQuestions.map((q, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <TextInput
                label={`Question ${i + 1}`}
                placeholder="Which trips are coming up?"
                value={q}
                isDisabled={!canEdit}
                onChange={(v) => set("quickQuestions", f.quickQuestions.map((x, j) => (j === i ? v : x)))}
              />
            </div>
            {canEdit && (
              <span className="flex shrink-0 gap-1 pb-0.5">
                <Button size="sm" variant="ghost" label="Move up" isIconOnly icon={<ArrowUp className="h-4 w-4" />} isDisabled={i === 0} onClick={() => set("quickQuestions", move(f.quickQuestions, i, -1))} />
                <Button
                  size="sm"
                  variant="ghost"
                  label="Move down"
                  isIconOnly
                  icon={<ArrowDown className="h-4 w-4" />}
                  isDisabled={i === f.quickQuestions.length - 1}
                  onClick={() => set("quickQuestions", move(f.quickQuestions, i, 1))}
                />
                <Button size="sm" variant="ghost" label="Remove" isIconOnly icon={<Trash2 className="h-4 w-4" />} onClick={() => set("quickQuestions", f.quickQuestions.filter((_, j) => j !== i))} />
              </span>
            )}
          </div>
        ))}
        {f.quickQuestions.length === 0 && <p className="text-sm text-stone-600">No quick questions — visitors type their own.</p>}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {f.quickQuestions.length < MAX_QUESTIONS && (
              <Button size="sm" label="Add question" icon={<Plus className="h-4 w-4" />} onClick={() => set("quickQuestions", [...f.quickQuestions, ""])} />
            )}
            <Button
              size="sm"
              variant="ghost"
              label="Use the suggested questions"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => set("quickQuestions", [...DEFAULT_ASSISTANT_SETTINGS.quickQuestions])}
            />
          </div>
        )}
      </Group>

      <Group title="Smart answers (AI)">
        <Switch
          label="Let the AI answer questions the guide does not understand"
          description="The guide always answers from your live data first. With this on, other free-form questions go to the AI, which is given the same live data and told never to guess prices, dates, seats or policies."
          value={f.smartAnswers}
          isDisabled={!canEdit}
          onChange={(v) => set("smartAnswers", v)}
        />
        {aiReady ? (
          <Banner
            status="success"
            title="Smart answers are ready (AI key found on the server)"
            description={f.smartAnswers ? undefined : "Switched off above: every answer comes from your live data only."}
            collapsible={false}
          />
        ) : (
          <Banner
            status="warning"
            title="Not active"
            description="Add ANTHROPIC_API_KEY in Vercel → Project → Settings → Environment Variables, then redeploy. Until then the guide answers from your live data only."
            collapsible={false}
          />
        )}
      </Group>

      <Group
        title={`Guide character pictures & videos (${filledMedia}/${GUIDE_EMOTIONS.length})`}
        hint="Upload the files in Admin → Media library, copy the link, paste here (or press Choose). Videos (.mp4/.webm) play silently on loop; photos get gentle motion. Use the same person in the same outfit for every emotion so the guide looks real and consistent. Empty emotions use the Idle one; with no Idle, the chat shows the Sanchari badge."
      >
        <Switch
          label="Pictures have a see-through background (show the guide as a 3D pop-out, no circle)"
          description="On for cut-out PNG/WebP pictures like the built-in ones. Switch off if your pictures or videos have their own background: they are then shown in a round frame."
          value={f.guideCutout}
          isDisabled={!canEdit}
          onChange={(v) => set("guideCutout", v)}
        />
        <div className="grid gap-3 xl:grid-cols-2">
          {GUIDE_EMOTIONS.map((e) => {
            const url = f.guideMedia[e] ?? "";
            return (
              <div key={e} className="space-y-3 rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex gap-3">
                  <MediaPreview url={url.trim()} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <TextInput
                      label={EMOTION_HINTS[e].label}
                      description={EMOTION_HINTS[e].hint}
                      placeholder="https://… or /media/guide-idle.mp4"
                      value={url}
                      isDisabled={!canEdit}
                      onChange={(v) => setMedia(e, v.trim())}
                    />
                    {canEdit && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" label="Choose" icon={<ImagePlus className="h-4 w-4" />} onClick={() => setPicker(picker === e ? null : e)} />
                        {url && <Button size="sm" variant="ghost" label="Clear" icon={<X className="h-4 w-4" />} onClick={() => setMedia(e, "")} />}
                      </div>
                    )}
                  </div>
                </div>
                {picker === e && (
                  <div className="rounded-2xl border border-forest-800/30 bg-cream-100/70 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-forest-900">Media library — pick the {EMOTION_HINTS[e].label.toLowerCase()} file</p>
                      <Button size="sm" variant="ghost" label="Close" onClick={() => setPicker(null)} />
                    </div>
                    <MediaLibrary
                      canEdit={canEdit}
                      compact
                      pickLabel={`Use for ${EMOTION_HINTS[e].label}`}
                      onPick={(picked) => {
                        setMedia(e, picked);
                        setPicker(null);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Group>

      {canEdit && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-white/95 py-3">
          <Button variant="primary" label="Save chat guide" isLoading={busy} onClick={onSave} />
          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        </div>
      )}
      {!canEdit && notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
    </div>
  );
}
