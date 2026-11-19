"use client";

import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("@/components/Dashboard"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#07111f] text-slate-100 flex items-center justify-center font-sans">
      <div className="flex items-center space-x-3 text-slate-400">
        <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading Noruva Revenue Engine...</span>
      </div>
    </div>
  ),
});

export default function Page() {
  return <Dashboard />;
}
