"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

/**
 * Onboarding Page
 *
 * Beautiful multi-step onboarding for new shop registration
 * Designed for users with less computer experience
 */

type Step = 1 | 2 | 3;

interface FormData {
  businessName: string;
  businessPhone: string;
  ownerName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState<FormData>({
    businessName: "",
    businessPhone: "",
    ownerName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  const validateStep1 = () => {
    if (!formData.businessName.trim()) {
      setError("Please enter your shop/business name");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!formData.ownerName.trim()) {
      setError("Please enter your full name");
      return false;
    }
    if (
      !formData.email.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    ) {
      setError("Please enter a valid email address");
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!formData.password || formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const handleSubmit = async () => {
    if (!validateStep3()) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.ownerName,
          email: formData.email,
          password: formData.password,
          businessName: formData.businessName,
          phone: formData.businessPhone || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Registration failed. Please try again.");
        setIsLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        router.push("/auth/login?registered=true");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo Area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-xl mb-4">
            <span className="text-4xl">🏪</span>
          </div>
          <h1 className="text-3xl font-bold text-white">PETROS</h1>
          <p className="text-blue-200 mt-1">Set up your shop in minutes</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8 gap-3">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                  step === s
                    ? "bg-white text-blue-700 shadow-lg scale-110"
                    : step > s
                      ? "bg-green-400 text-white"
                      : "bg-blue-500 text-blue-200"
                }`}
              >
                {step > s ? "✓" : s}
              </div>
              {s < 3 && (
                <div
                  className={`w-12 h-1 mx-1 rounded ${step > s ? "bg-green-400" : "bg-blue-500"}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white shadow-2xl p-8">
          {/* Step 1: Shop Info */}
          {step === 1 && (
            <div>
              <div className="text-center mb-6">
                <span className="text-5xl">🏬</span>
                <h2 className="text-2xl font-bold text-gray-900 mt-3">
                  Tell us about your shop
                </h2>
                <p className="text-gray-500 mt-1">
                  What is your shop or business called?
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-base font-semibold text-gray-700 mb-2">
                    Shop / Business Name *
                  </label>
                  <input
                    name="businessName"
                    type="text"
                    value={formData.businessName}
                    onChange={handleChange}
                    placeholder="e.g. ABC Market, John's Store"
                    className="w-full px-4 py-4 text-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-0 focus:outline-none transition-colors"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-base font-semibold text-gray-700 mb-2">
                    Shop Phone Number{" "}
                    <span className="text-gray-400 font-normal">
                      (optional)
                    </span>
                  </label>
                  <input
                    name="businessPhone"
                    type="tel"
                    value={formData.businessPhone}
                    onChange={handleChange}
                    placeholder="e.g. 0551234567"
                    className="w-full px-4 py-4 text-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-0 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Owner Info */}
          {step === 2 && (
            <div>
              <div className="text-center mb-6">
                <span className="text-5xl">👤</span>
                <h2 className="text-2xl font-bold text-gray-900 mt-3">
                  Your account details
                </h2>
                <p className="text-gray-500 mt-1">
                  Who is the owner of this shop?
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-base font-semibold text-gray-700 mb-2">
                    Your Full Name *
                  </label>
                  <input
                    name="ownerName"
                    type="text"
                    value={formData.ownerName}
                    onChange={handleChange}
                    placeholder="e.g. Kwame Mensah"
                    className="w-full px-4 py-4 text-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-0 focus:outline-none transition-colors"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-base font-semibold text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="e.g. kwame@example.com"
                    className="w-full px-4 py-4 text-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-0 focus:outline-none transition-colors"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    You will use this email to log in
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Password */}
          {step === 3 && (
            <div>
              <div className="text-center mb-6">
                <span className="text-5xl">🔒</span>
                <h2 className="text-2xl font-bold text-gray-900 mt-3">
                  Create your password
                </h2>
                <p className="text-gray-500 mt-1">
                  Make it strong and memorable
                </p>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-base font-semibold text-gray-700 mb-2">
                    Password *
                  </label>
                  <input
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="At least 8 characters"
                    className="w-full px-4 py-4 text-lg border-2 border-gray-200 focus:border-blue-500 focus:ring-0 focus:outline-none transition-colors"
                    autoFocus
                  />
                  {formData.password.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full ${
                            formData.password.length >= i * 3
                              ? formData.password.length >= 12
                                ? "bg-green-500"
                                : "bg-yellow-400"
                              : "bg-gray-200"
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-base font-semibold text-gray-700 mb-2">
                    Confirm Password *
                  </label>
                  <input
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Type password again"
                    className={`w-full px-4 py-4 text-lg border-2 focus:ring-0 focus:outline-none transition-colors ${
                      formData.confirmPassword &&
                      formData.password !== formData.confirmPassword
                        ? "border-red-400 focus:border-red-500"
                        : formData.confirmPassword &&
                            formData.password === formData.confirmPassword
                          ? "border-green-400 focus:border-green-500"
                          : "border-gray-200 focus:border-blue-500"
                    }`}
                  />
                  {formData.confirmPassword &&
                    formData.password === formData.confirmPassword && (
                      <p className="mt-1 text-sm text-green-600 font-medium">
                        ✓ Passwords match
                      </p>
                    )}
                </div>

                {/* Summary */}
                <div className="bg-blue-50 p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">
                    Account Summary
                  </h3>
                  <div className="space-y-1 text-sm text-blue-800">
                    <p>
                      🏬 <strong>{formData.businessName}</strong>
                    </p>
                    <p>👤 {formData.ownerName}</p>
                    <p>📧 {formData.email}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm font-medium">
              ⚠ {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 space-y-3">
            {step < 3 ? (
              <button
                onClick={handleNext}
                className="w-full py-4 bg-blue-600 text-white text-lg font-bold hover:bg-blue-700 active:scale-95 transition-all shadow-lg"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="w-full py-4 bg-green-600 text-white text-lg font-bold hover:bg-green-700 active:scale-95 transition-all shadow-lg disabled:opacity-60"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Setting up your shop...
                  </span>
                ) : (
                  "🚀 Create My Shop"
                )}
              </button>
            )}

            {step > 1 && (
              <button
                onClick={() => setStep((step - 1) as Step)}
                className="w-full py-3 border-2 border-gray-200 text-gray-600 text-base font-semibold hover:bg-gray-50 transition-colors"
              >
                ← Go Back
              </button>
            )}
          </div>

          {/* Login Link */}
          <p className="text-center mt-5 text-gray-500 text-sm">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="text-blue-600 font-semibold hover:text-blue-700"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
