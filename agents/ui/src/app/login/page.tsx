"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) router.push("/runs");
    else setError("wrong password");
  }

  return (
    <div className="card">
      <h2>Sign in</h2>
      <form className="stack" onSubmit={submit}>
        <input
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button type="submit">Sign in</button>
        {error && <span className="status-failed">{error}</span>}
      </form>
      <p className="dim">Shared-secret scaffold — the real mechanism is open question #6 (by M4).</p>
    </div>
  );
}
