"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  VALID_GRANT_TYPES,
  VALID_GRANT_STATUS,
  VALID_BUSINESS_STAGE,
  VALID_GENDER_FOCUS,
} from "@/lib/constants";
import { Button, LinkButton } from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import ConfirmModal from "@/components/ConfirmModal";
import { fieldInputClass } from "@/components/ui/FormField";
import TagInput from "@/components/ui/TagInput";
import { useMetaValues } from "@/lib/hooks/useMetaValues";
import { toast } from "@/lib/toast";

interface GrantFormData {
  title: string;
  description: string;
  sourceName: string;
  sourceUrl: string;
  amount: string;
  amountMin: string;
  amountMax: string;
  deadline: string;
  eligibility: string;
  grantType: string;
  status: string;
  businessStage: string;
  gender: string;
  locations: string;
  industries: string;
  pdfUrl: string;
}

function toDateInputValue(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function parseCsvToTags(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function tagsToCsv(tags: string[]): string {
  return tags.join(", ");
}

export default function EditGrantPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);

  const { values: locationSuggestions } = useMetaValues("/api/meta/locations", "locations");
  const { values: industrySuggestions } = useMetaValues("/api/meta/industries", "industries");

  // Snapshot of the fetched form so we can detect dirty changes. Stored
  // in a ref to avoid triggering a re-render when we update it after
  // a successful save.
  const initialFormRef = useRef<GrantFormData | null>(null);

  const [form, setForm] = useState<GrantFormData>({
    title: "",
    description: "",
    sourceName: "",
    sourceUrl: "",
    amount: "",
    amountMin: "",
    amountMax: "",
    deadline: "",
    eligibility: "",
    grantType: "FEDERAL",
    status: "OPEN",
    businessStage: "BOTH",
    gender: "ANY",
    locations: "",
    industries: "",
    pdfUrl: "",
  });

  const fetchGrant = useCallback(async () => {
    try {
      const res = await fetch(`/api/grants/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok === false) throw new Error("Failed to load grant");
      const data = await res.json();
      const loaded: GrantFormData = {
        title: data.title || "",
        description: data.description || "",
        sourceName: data.sourceName || "",
        sourceUrl: data.sourceUrl || "",
        amount: data.amount || "",
        amountMin: data.amountMin == null ? "" : String(data.amountMin),
        amountMax: data.amountMax == null ? "" : String(data.amountMax),
        deadline: toDateInputValue(data.deadline),
        eligibility: data.eligibility || "",
        grantType: data.grantType || "FEDERAL",
        status: data.status || "OPEN",
        businessStage: data.businessStage || "BOTH",
        gender: data.gender || "ANY",
        locations: (data.locations || []).join(", "),
        industries: (data.industries || []).join(", "),
        pdfUrl: data.pdfUrl || "",
      };
      setForm(loaded);
      initialFormRef.current = loaded;
    } catch {
      setError("Failed to load grant data.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGrant();
  }, [fetchGrant]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Dirty = current form differs from the snapshot loaded from the server.
  // JSON.stringify is fine for a 15-field flat object of strings.
  const dirty =
    initialFormRef.current !== null &&
    JSON.stringify(form) !== JSON.stringify(initialFormRef.current);

  // Warn on browser tab close / reload when there are unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // returnValue is deprecated, but Safari and some older Chromium
      // versions only show the unsaved-changes prompt when it's set in
      // addition to calling preventDefault(). Keep both for compat.
      e.returnValue = ""; // NOSONAR: legacy browser compat
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const body: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        sourceName: form.sourceName,
        sourceUrl: form.sourceUrl,
        amount: form.amount || null,
        amountMin: form.amountMin ? Number.parseInt(form.amountMin, 10) : null,
        amountMax: form.amountMax ? Number.parseInt(form.amountMax, 10) : null,
        deadline: form.deadline ? new Date(form.deadline + "T00:00:00Z").toISOString() : null,
        eligibility: form.eligibility || null,
        grantType: form.grantType,
        status: form.status,
        businessStage: form.businessStage,
        gender: form.gender,
        locations: form.locations
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        industries: form.industries
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
        pdfUrl: form.pdfUrl || null,
      };

      const res = await fetch(`/api/grants/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update grant");
      }

      toast.success("Grant updated successfully");
      setSuccess("Grant updated successfully.");
      // Refresh the snapshot so `dirty` resets and the beforeunload
      // warning goes away until the next edit.
      initialFormRef.current = form;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update grant.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[var(--muted)]">Loading grant...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-4">Grant Not Found</h1>
        <Link
          href="/"
          className="text-[var(--primary)] hover:text-[var(--primary-light)] font-medium"
        >
          &larr; Back to all grants
        </Link>
      </div>
    );
  }

  const inputClass = fieldInputClass;
  const labelClass = "block text-sm font-medium text-[var(--foreground)] mb-1";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Edit Grant</h1>
          <p className="text-[var(--muted)]">
            Fix mistakes in grant details. Changes take effect immediately.
          </p>
        </div>
        <Link
          href={`/grants/${id}`}
          className="text-[var(--primary)] hover:text-[var(--primary-light)] text-sm font-medium"
        >
          &larr; Back to Grant
        </Link>
      </div>

      <div className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              Basic Information
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className={labelClass}>
                  Title *
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  value={form.title}
                  onChange={handleChange}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="description" className={labelClass}>
                  Description *
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={6}
                  value={form.description}
                  onChange={handleChange}
                  required
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sourceName" className={labelClass}>
                    Source Name *
                  </label>
                  <input
                    id="sourceName"
                    name="sourceName"
                    type="text"
                    value={form.sourceName}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="sourceUrl" className={labelClass}>
                    Source URL *
                  </label>
                  <input
                    id="sourceUrl"
                    name="sourceUrl"
                    type="url"
                    value={form.sourceUrl}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Funding */}
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Funding</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="amount" className={labelClass}>
                  Amount (display text)
                </label>
                <input
                  id="amount"
                  name="amount"
                  type="text"
                  value={form.amount}
                  onChange={handleChange}
                  placeholder='e.g., "Up to $50,000"'
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="amountMin" className={labelClass}>
                  Amount Min ($)
                </label>
                <input
                  id="amountMin"
                  name="amountMin"
                  type="number"
                  min="0"
                  value={form.amountMin}
                  onChange={handleChange}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="amountMax" className={labelClass}>
                  Amount Max ($)
                </label>
                <input
                  id="amountMax"
                  name="amountMax"
                  type="number"
                  min="0"
                  value={form.amountMax}
                  onChange={handleChange}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Status & Classification */}
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              Status & Classification
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="deadline" className={labelClass}>
                  Deadline
                </label>
                <input
                  id="deadline"
                  name="deadline"
                  type="date"
                  value={form.deadline}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="status" className={labelClass}>
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {VALID_GRANT_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="grantType" className={labelClass}>
                  Grant Type
                </label>
                <select
                  id="grantType"
                  name="grantType"
                  value={form.grantType}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {VALID_GRANT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="businessStage" className={labelClass}>
                  Business Stage
                </label>
                <select
                  id="businessStage"
                  name="businessStage"
                  value={form.businessStage}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {VALID_BUSINESS_STAGE.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="gender" className={labelClass}>
                  Gender / Demographic Focus
                </label>
                <select
                  id="gender"
                  name="gender"
                  value={form.gender}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {VALID_GENDER_FOCUS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Targeting */}
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">Targeting</h2>
            <div className="space-y-4">
              <div>
                <span id="locations-label" className={labelClass}>
                  Locations
                </span>
                <TagInput
                  ariaLabel="Locations"
                  values={parseCsvToTags(form.locations)}
                  suggestions={locationSuggestions}
                  placeholder="e.g., Iowa, Des Moines"
                  onChange={(next) => setForm((prev) => ({ ...prev, locations: tagsToCsv(next) }))}
                />
              </div>
              <div>
                <span id="industries-label" className={labelClass}>
                  Industries
                </span>
                <TagInput
                  ariaLabel="Industries"
                  values={parseCsvToTags(form.industries)}
                  suggestions={industrySuggestions}
                  placeholder="e.g., Agriculture, Technology"
                  onChange={(next) => setForm((prev) => ({ ...prev, industries: tagsToCsv(next) }))}
                />
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              Additional Details
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="eligibility" className={labelClass}>
                  Eligibility Requirements
                </label>
                <textarea
                  id="eligibility"
                  name="eligibility"
                  rows={4}
                  value={form.eligibility}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="pdfUrl" className={labelClass}>
                  PDF Guidelines URL
                </label>
                <input
                  id="pdfUrl"
                  name="pdfUrl"
                  type="url"
                  value={form.pdfUrl}
                  onChange={handleChange}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {error && <Alert variant="error">{error}</Alert>}
          {success && (
            <Alert variant="success">
              {success}{" "}
              <Link href={`/grants/${id}`} className="underline font-medium">
                View grant
              </Link>
            </Alert>
          )}

          <div className="flex items-center gap-4 pt-2">
            <Button type="submit" loading={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
            {dirty ? (
              <Button
                variant="secondary"
                onClick={(e) => {
                  e.preventDefault();
                  setConfirmLeave(true);
                }}
              >
                Cancel
              </Button>
            ) : (
              <LinkButton variant="secondary" href={`/grants/${id}`}>
                Cancel
              </LinkButton>
            )}
          </div>
        </form>
      </div>

      <ConfirmModal
        open={confirmLeave}
        title="Discard unsaved changes?"
        message="You have edited this grant. Leaving now will discard your changes."
        confirmLabel="Discard"
        onConfirm={() => {
          setConfirmLeave(false);
          // Clear the snapshot so `dirty` goes false and beforeunload
          // doesn't fire on the pending navigation.
          initialFormRef.current = form;
          router.push(`/grants/${id}`);
        }}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}
