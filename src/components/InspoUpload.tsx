import { useRef, useState } from "react";

/* ---- Options (edit freely) ---- */
const STYLE_OPTIONS = [
  "minimalist", "modern", "boho", "industrial", "scandinavian",
  "maximalist", "coastal", "rustic", "transitional", "art-deco",
] as const;

type PaletteOption = { id: string; label: string; colors: string[] };
const PALETTE_OPTIONS: PaletteOption[] = [
  { id: "warm-neutrals", label: "Warm Neutrals", colors: ["#E7DECD", "#C9B79C", "#8A7968", "#4A4039"] },
  { id: "earthy", label: "Earthy", colors: ["#DCD2BE", "#A8B59A", "#7A6A53", "#3C3326"] },
  { id: "coastal", label: "Coastal", colors: ["#EAF1F2", "#B7D3D6", "#5E97A3", "#2E4A52"] },
  { id: "moody", label: "Moody Dark", colors: ["#D9CFC4", "#7C7A78", "#3A3B3C", "#1B1B1D"] },
  { id: "pastel", label: "Soft Pastel", colors: ["#F6E6E8", "#E7D6F0", "#CFE3E0", "#F2EAD8"] },
  { id: "mono", label: "Monochrome", colors: ["#F2F0EC", "#C2BFB8", "#6E6B66", "#2A2825"] },
];

/* ---- Types ---- */
type ImageSource = "pinterest" | "upload";
interface InspoImage {
  _id: string;
  source: ImageSource;
  url?: string;
  data?: string;
}
interface Props {
  roomId: string;            // comes from Saanvi's room step
  onSaved?: () => void;
}

const ROOMS = "/api/rooms";  // Vite proxy forwards this to the Express server

export default function InspoUpload({ roomId, onSaved }: Props) {
  const [images, setImages] = useState<InspoImage[]>([]);
  const [boardUrl, setBoardUrl] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  const [budget, setBudget] = useState(1500);
  const [styleTag, setStyleTag] = useState<string | null>(null);
  const [paletteId, setPaletteId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handlePinterest() {
    setError(""); setNotice("");
    if (!boardUrl.trim()) return setError("Paste a Pinterest board link first.");
    setPinLoading(true);
    try {
      const res = await fetch(`${ROOMS}/${roomId}/pinterest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't fetch that board.");
      setImages((prev) => [...prev, ...(data as InspoImage[])]);
      setBoardUrl("");
      setNotice(`Pulled ${data.length} pin${data.length === 1 ? "" : "s"} in.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPinLoading(false);
    }
  }

  async function handleFiles(fileList: FileList | null) {
    setError(""); setNotice("");
    const files = Array.from(fileList || []);
    if (!files.length) return;
    try {
      const form = new FormData();
      files.forEach((f) => form.append("images", f));
      const res = await fetch(`${ROOMS}/${roomId}/images`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setImages((prev) => [...prev, ...(data as InspoImage[])]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeImage(id: string) {
    await fetch(`${ROOMS}/${roomId}/images/${id}`, { method: "DELETE" });
    setImages((prev) => prev.filter((i) => i._id !== id));
  }

  async function saveStyleAndBudget() {
    setSaving(true); setError(""); setNotice("");
    try {
      const palette = PALETTE_OPTIONS.find((p) => p.id === paletteId);
      const styleRes = await fetch(`${ROOMS}/${roomId}/style`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleTag, colorPalette: palette ? palette.colors : [] }),
      });
      if (!styleRes.ok) throw new Error("Couldn't save style.");

      // Budget writes onto the room doc; ignore a 501 if Saanvi's model isn't loaded yet.
      await fetch(`${ROOMS}/${roomId}/budget`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetTotal: budget }),
      });

      setNotice("Saved \u2726");
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dollars = (n: number) => `$${n.toLocaleString()}`;
  const BUDGET_STOPS = [500, 1000, 2500, 5000, 10000];

  return (
    <section className="mx-auto max-w-3xl rounded-2xl bg-stone-50 p-8 text-stone-800">
      <header className="mb-7">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b1542f]">
          Step 02 — Inspiration
        </span>
        <h1 className="mt-2 font-serif text-4xl leading-tight">Pull together the look</h1>
        <p className="mt-2 max-w-prose text-stone-500">
          Drop a Pinterest board or your own photos, set a budget, and pick the vibe.
        </p>
      </header>

      {error && <div className="mb-4 rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">{error}</div>}
      {notice && <div className="mb-4 rounded-lg bg-green-100 px-4 py-3 text-sm text-green-800">{notice}</div>}

      {/* Pinterest */}
      <div className="mb-4 rounded-xl border border-stone-200 bg-white/70 p-5">
        <label className="mb-3 block text-sm font-semibold">Pinterest board link</label>
        <div className="flex gap-2">
          <input
            type="url"
            value={boardUrl}
            onChange={(e) => setBoardUrl(e.target.value)}
            placeholder="https://pinterest.com/you/dream-living-room/"
            className="flex-1 rounded-lg border border-stone-200 px-3 py-2 outline-none focus:border-[#b1542f]"
          />
          <button
            onClick={handlePinterest}
            disabled={pinLoading}
            className="rounded-lg bg-[#b1542f] px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {pinLoading ? "Fetching…" : "Fetch board"}
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Board must be public. If nothing comes through, just upload images below.
        </p>
      </div>

      {/* Upload */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        className="mb-4 cursor-pointer rounded-xl border border-dashed border-stone-300 bg-white/70 p-6 text-center hover:border-[#b1542f]"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <span className="text-2xl text-[#b1542f]">＋</span>
        <p className="text-sm text-stone-500">Drag images here or click to upload</p>
      </div>

      {/* Grid */}
      {images.length > 0 && (
        <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3">
          {images.map((img) => (
            <figure key={img._id} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-stone-200">
              <img src={img.source === "upload" ? img.data : img.url} alt="" className="h-full w-full object-cover" />
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                {img.source === "upload" ? "Upload" : "Pin"}
              </span>
              <button
                onClick={() => removeImage(img._id)}
                aria-label="Remove"
                className="absolute right-1.5 top-1.5 h-6 w-6 rounded-full bg-white/90 text-base leading-none"
              >
                ×
              </button>
            </figure>
          ))}
        </div>
      )}

      {/* Budget */}
      <div className="mb-4 rounded-xl border border-stone-200 bg-white/70 p-5">
        <div className="flex items-baseline justify-between">
          <label className="text-sm font-semibold">Budget</label>
          <span className="font-serif text-xl text-[#b1542f]">{dollars(budget)}</span>
        </div>
        <input
          type="range" min={0} max={10000} step={100}
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          className="mt-2 w-full accent-[#b1542f]"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {BUDGET_STOPS.map((s) => (
            <button
              key={s}
              onClick={() => setBudget(s)}
              className={`rounded-full border px-3 py-1 text-xs ${
                budget === s ? "border-[#b1542f] bg-[#f0dccf]" : "border-stone-200"
              }`}
            >
              {s === 10000 ? "$10,000+" : dollars(s)}
            </button>
          ))}
        </div>
      </div>

      {/* Style */}
      <div className="mb-4 rounded-xl border border-stone-200 bg-white/70 p-5">
        <label className="mb-3 block text-sm font-semibold">Pick a style</label>
        <div className="flex flex-wrap gap-2">
          {STYLE_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStyleTag(s)}
              className={`rounded-full border px-3 py-1.5 text-sm capitalize ${
                styleTag === s ? "border-[#b1542f] bg-[#f0dccf]" : "border-stone-200 hover:border-[#b1542f]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Palette */}
      <div className="mb-4 rounded-xl border border-stone-200 bg-white/70 p-5">
        <label className="mb-3 block text-sm font-semibold">Color palette</label>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
          {PALETTE_OPTIONS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPaletteId(p.id)}
              className={`rounded-xl border p-2 ${
                paletteId === p.id ? "border-[#b1542f] ring-2 ring-[#f0dccf]" : "border-stone-200"
              }`}
            >
              <span className="flex h-9 overflow-hidden rounded-lg">
                {p.colors.map((c) => (
                  <span key={c} className="flex-1" style={{ background: c }} />
                ))}
              </span>
              <small className="mt-1 block text-center text-xs text-stone-500">{p.label}</small>
            </button>
          ))}
        </div>
      </div>

      {/* Wildcard (placeholder, per plan) + Save */}
      <div className="flex justify-between gap-3">
        <button
          disabled
          title="Coming soon"
          className="cursor-not-allowed rounded-lg border border-dashed border-stone-300 px-4 py-2 text-stone-400"
        >
          ✦ Wild card — coming soon
        </button>
        <button
          onClick={saveStyleAndBudget}
          disabled={saving}
          className="rounded-lg bg-[#b1542f] px-5 py-2 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save style & budget"}
        </button>
      </div>
    </section>
  );
}