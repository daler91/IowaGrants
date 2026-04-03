"use client";

import { useState, useEffect, useCallback } from "react";

interface AdminInfo {
  id: string;
  email: string;
  name: string | null;
}

export function useAdmin() {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAdmin(data?.admin ?? null))
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false));
  }, []);

  const clearAdmin = useCallback(() => setAdmin(null), []);

  return { admin, loading, isAuthenticated: admin !== null, clearAdmin };
}
