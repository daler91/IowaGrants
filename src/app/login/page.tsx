"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import FormField, { fieldInputClass } from "@/components/ui/FormField";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Login failed");
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
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2 text-center">
          Admin Login
        </h1>
        <p className="text-sm text-[var(--muted)] mb-6 text-center">
          Admin access only. Contact the site owner to request an invite.
        </p>
        <form
          onSubmit={handleSubmit}
          className="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 space-y-4"
        >
          {error && <Alert variant="error">{error}</Alert>}
          <FormField label="Email" htmlFor="email" required>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
          <Button type="submit" loading={loading} className="w-full">
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
