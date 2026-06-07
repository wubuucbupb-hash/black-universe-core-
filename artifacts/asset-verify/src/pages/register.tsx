import React, { useState } from "react";

export default function RegisterComponent() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!name || !email || !phoneNumber || !password) {
      setError("All fields are required");
      return;
    }

    try {
      // NOTE: :3000 hata diya hai taaki Replit direct connect kare
      const response = await fetch(
        `${window.location.protocol}//${window.location.host.replace(":3000", "")}/api/users/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            email,
            phoneNumber,
            password,
          }),
        },
      );

      const data = await response.json();

      if (response.ok) {
        setMessage("Account created successfully!");
        setName("");
        setEmail("");
        setPhoneNumber("");
        setPassword("");
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch (err) {
      console.error("Frontend Signup Error:", err);
      setError("Failed to connect to the server.");
    }
  };

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "400px",
        margin: "0 auto",
        color: "#fff",
      }}
    >
      <h2>Create Account</h2>

      {message && <p style={{ color: "green" }}>{message}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      <form
        onSubmit={handleRegister}
        style={{ display: "flex", flexDirection: "column", gap: "10px" }}
      >
        <input
          type="text"
          placeholder="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: "8px",
            background: "#222",
            color: "#fff",
            border: "1px solid #444",
          }}
        />

        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            padding: "8px",
            background: "#222",
            color: "#fff",
            border: "1px solid #444",
          }}
        />

        <input
          type="text"
          placeholder="Phone Number"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          style={{
            padding: "8px",
            background: "#222",
            color: "#fff",
            border: "1px solid #444",
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            padding: "8px",
            background: "#222",
            color: "#fff",
            border: "1px solid #444",
          }}
        />

        <button
          type="submit"
          style={{
            padding: "10px",
            background: "#0070f3",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          Register
        </button>
      </form>
    </div>
  );
}
