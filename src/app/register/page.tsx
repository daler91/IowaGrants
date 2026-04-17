"use client";

import { Suspense, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import FormField, { fieldInputClass } from "@/components/ui/FormField";

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="h-8 w-8 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}

function getHashParam(key: string): string | null {
  const hash = globalThis.location.hash.replace(/^#/, "");
  return new URLSearchParams(hash).get(key);
}

const subscribe = () => () => {};

function useHashParam(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => getHashParam(key),
    () => null,
  );
}

function RegisterForm() {
  const router = useRouter();
  const token = useHashParam("token");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">Invalid Link</h1>
          <p className="text-[var(--muted)]">This registration link is missing or invalid.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name: name || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Registration failed.");
        return;
      }

      router.push("/admin");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6 text-center">
          Create Admin Account
        </h1>
        <form
          onSubmit={handleSubmit}
          className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 space-y-4"
        >
          {error && <Alert variant="error">{error}</Alert>}
          <FormField label="Name (optional)" htmlFor="name">
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldInputClass}
            />
          </FormField>
          <FormField label="Password" htmlFor="password" required hint="At least 12 characters.">
            <input
              id="password"
              type="password"
              required
              minLength={12}
              aria-describedby="password-hint"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldInputClass}
            />
          </FormField>
          <FormField
            label="Confirm Password"
            htmlFor="confirmPassword"
            required
            hint="Re-enter the same password."
          >
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={12}
              aria-describedby="confirmPassword-hint"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={fieldInputClass}
            />
          </FormField>
          <Button type="submit" loading={loading} className="w-full">
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
