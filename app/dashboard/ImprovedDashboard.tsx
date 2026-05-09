"use client";

import Link from "next/link";
import {
  ShoppingCart,
  Package,
  Users,
  Truck,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Plus,
  FileText,
  Settings,
} from "lucide-react";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";

interface DashboardProps {
  userName: string;
  tenantName: string;
}

export function ImprovedDashboard({ userName, tenantName }: DashboardProps) {
  // Quick Action Cards - Large, colorful, easy to tap
  const quickActions = [
    {
      title: "New Sale",
      description: "Record a sale",
      icon: <ShoppingCart className="w-10 h-10" />,
      href: "/sales/new",
      color: "bg-gradient-to-br from-green-500 to-green-600",
      hoverColor: "hover:from-green-600 hover:to-green-700",
    },
    {
      title: "New Purchase",
      description: "Record purchase",
      icon: <Package className="w-10 h-10" />,
      href: "/purchases/new",
      color: "bg-gradient-to-br from-blue-500 to-blue-600",
      hoverColor: "hover:from-blue-600 hover:to-blue-700",
    },
    {
      title: "Customers",
      description: "View customers",
      icon: <Users className="w-10 h-10" />,
      href: "/customers",
      color: "bg-gradient-to-br from-purple-500 to-purple-600",
      hoverColor: "hover:from-purple-600 hover:to-purple-700",
    },
    {
      title: "Suppliers",
      description: "View suppliers",
      icon: <Truck className="w-10 h-10" />,
      href: "/suppliers",
      color: "bg-gradient-to-br from-orange-500 to-orange-600",
      hoverColor: "hover:from-orange-600 hover:to-orange-700",
    },
  ];

  // Management Cards
  const managementActions = [
    {
      title: "Inventory",
      description: "Manage items",
      icon: <Package className="w-8 h-8" />,
      href: "/items",
      color: "bg-indigo-50",
      textColor: "text-indigo-700",
      borderColor: "border-indigo-200",
    },
    {
      title: "Reports",
      description: "View reports",
      icon: <FileText className="w-8 h-8" />,
      href: "/reports",
      color: "bg-cyan-50",
      textColor: "text-cyan-700",
      borderColor: "border-cyan-200",
    },
    {
      title: "Payments",
      description: "Record payments",
      icon: <DollarSign className="w-8 h-8" />,
      href: "/payments",
      color: "bg-emerald-50",
      textColor: "text-emerald-700",
      borderColor: "border-emerald-200",
    },
    {
      title: "Settings",
      description: "App settings",
      icon: <Settings className="w-8 h-8" />,
      href: "/settings",
      color: "bg-gray-50",
      textColor: "text-gray-700",
      borderColor: "border-gray-200",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b-4 border-blue-600">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex-1" />
            <div className="text-center flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-1">
                {tenantName}
              </h1>
              <p className="text-base text-gray-600">
                Welcome back,{" "}
                <span className="font-semibold text-blue-600">{userName}</span>
              </p>
            </div>
            <div className="flex-1 flex justify-end">
              <Link
                href="/api/auth/signout"
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 font-semibold rounded-xl text-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Quick Actions Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-blue-600" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`${action.color} ${action.hoverColor} text-white rounded-2xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 p-6 block`}
              >
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="bg-white bg-opacity-20 rounded-full p-4">
                    {action.icon}
                  </div>
                  <h3 className="text-2xl font-bold">{action.title}</h3>
                  <p className="text-sm opacity-90">{action.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Management Section */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Settings className="w-7 h-7 text-gray-700" />
            Management
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {managementActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`${action.color} ${action.textColor} border-2 ${action.borderColor} rounded-xl shadow hover:shadow-lg transform hover:scale-105 transition-all duration-200 p-6 block`}
              >
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className={`bg-white rounded-full p-3 shadow-sm`}>
                    {action.icon}
                  </div>
                  <h3 className="text-xl font-bold">{action.title}</h3>
                  <p className="text-sm opacity-75">{action.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Analytics Section */}
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-green-600" />
            Analytics
          </h2>
          <DashboardCharts />
        </section>

      </div>
    </div>
  );
}
