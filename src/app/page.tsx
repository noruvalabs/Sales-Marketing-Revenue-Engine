"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  ShieldCheck,
  Send,
  Building2,
  Users,
  Search,
  Plus,
  DollarSign,
  AlertTriangle,
  FileText,
  Briefcase,
  Layers,
  ChevronRight,
  RefreshCw,
  Mail,
  Zap,
  Ban,
  Trash2,
  ExternalLink,
  MessageSquare,
  Flame,
  CornerDownRight,
  Copy,
} from "lucide-react";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "discovery" | "approvals" | "conversations" | "pipeline" | "suppression" | "revenue"
  >("overview");
  const [killSwitchActive, setKillSwitchActive] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [suppressionList, setSuppressionList] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoringLoading, setScoringLoading] = useState(false);
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);
  const [simulatingReply, setSimulatingReply] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // New Lead Form State
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    industry: "B2B SaaS",
    size: "20-50",
    hiringSignals: "Hiring 3 Remote SDRs & Account Executives",
    contactName: "Alex Mercer",
    contactEmail: "alex@targetco.com",
    contactTitle: "VP of Sales",
  });

  // Suppression Form State
  const [suppressionInput, setSuppressionInput] = useState({
    emailOrDomain: "",
    reason: "Competitor or manual opt-out",
  });

  // Reply Simulator Form State
  const [simulatorInput, setSimulatorInput] = useState({
    selectedLeadId: "",
    customReply: "Hi! This timing is perfect—we just hired 4 new reps and ramping them is brutal. Can we do a 15-minute call Thursday morning?",
  });

  const fetchLeads = async () => {
    try {
      const res = await fetch("/api/leads");
      const data = await res.json();
      if (data.companies) {
        setCompanies(data.companies);
        if (data.companies.length > 0 && !simulatorInput.selectedLeadId) {
          setSimulatorInput((prev) => ({ ...prev, selectedLeadId: data.companies[0].id }));
        }
      }
    } catch (err) {
      console.error("Failed to load leads", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppressionList = async () => {
    try {
      const res = await fetch("/api/suppression");
      const data = await res.json();
      if (data.list) {
        setSuppressionList(data.list);
      }
    } catch (err) {
      console.error("Failed to load suppression list", err);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/inbound/reply");
      const data = await res.json();
      if (data.conversations) {
        setConversations(data.conversations);
      }
    } catch (err) {
      console.error("Failed to load conversations", err);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchSuppressionList();
    fetchConversations();
  }, []);

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setScoringLoading(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success && data.company) {
        setCompanies((prev) => [data.company, ...prev]);
        setFormData({
          name: "",
          domain: "",
          industry: "B2B SaaS",
          size: "20-50",
          hiringSignals: "",
          contactName: "",
          contactEmail: "",
          contactTitle: "",
        });
        setActiveTab("approvals");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setScoringLoading(false);
    }
  };

  const handleApprove = async (draftId: string, action: "APPROVE" | "REJECT") => {
    try {
      await fetch("/api/outreach/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, action }),
      });

      setCompanies((prev) =>
        prev.map((c) => {
          if (c.draft && c.draft.id === draftId) {
            return {
              ...c,
              draft: { ...c.draft, status: action === "APPROVE" ? "APPROVED" : "REJECTED" },
            };
          }
          return c;
        })
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDispatch = async (c: any) => {
    const draft = c.draft;
    const contact = c.contacts?.[0];
    if (!draft || !contact) return;

    setSendingDraftId(draft.id);
    setDispatchMessage(null);

    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: draft.id,
          toEmail: contact.email,
          toName: `${contact.firstName} ${contact.lastName}`,
          companyName: c.name,
          subject: draft.subject,
          body: draft.body,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setDispatchMessage({
          text: `Successfully dispatched to ${contact.email} ${data.simulated ? "(Simulation Sandbox Mode)" : ""}`,
          type: "success",
        });

        setCompanies((prev) =>
          prev.map((item) => {
            if (item.id === c.id) {
              return {
                ...item,
                draft: { ...item.draft, status: "SENT", sentAt: new Date().toISOString() },
                deal: { ...item.deal, stage: "CONTACTED" },
              };
            }
            return item;
          })
        );
      } else {
        setDispatchMessage({
          text: `Dispatch Blocked: ${data.error || "Failed to send"}`,
          type: "error",
        });
      }
    } catch (err: any) {
      setDispatchMessage({
        text: `Error sending: ${err.message}`,
        type: "error",
      });
    } finally {
      setSendingDraftId(null);
    }
  };

  const handleSimulateReply = async (presetText?: string) => {
    const textToSubmit = presetText || simulatorInput.customReply;
    if (!textToSubmit) return;

    const lead = companies.find((c) => c.id === simulatorInput.selectedLeadId) || companies[0];
    const contact = lead?.contacts?.[0] || { firstName: "Prospect", lastName: "Lead", email: "prospect@example.com" };

    setSimulatingReply(true);
    try {
      const res = await fetch("/api/inbound/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: contact.email,
          prospectName: `${contact.firstName} ${contact.lastName}`,
          companyName: lead?.name || "Target Corp",
          messageText: textToSubmit,
        }),
      });

      const data = await res.json();
      if (data.success && data.conversation) {
        setConversations((prev) => [data.conversation, ...prev]);

        // If interested, advance the deal stage on the UI
        if (data.classification?.intent === "INTERESTED") {
          setCompanies((prev) =>
            prev.map((item) => {
              if (item.id === lead?.id) {
                return {
                  ...item,
                  deal: { ...item.deal, stage: "MEETING_BOOKED" },
                };
              }
              return item;
            })
          );
          setDispatchMessage({
            text: `🔥 High-Intent Lead Detected! Deal promoted to "Meeting Booked" and Slack notification triggered.`,
            type: "success",
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimulatingReply(false);
    }
  };

  const handleAddSuppression = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = suppressionInput.emailOrDomain.trim();
    if (!val) return;

    const isEmail = val.includes("@");
    try {
      const res = await fetch("/api/suppression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: isEmail ? val : null,
          domain: !isEmail ? val : null,
          reason: suppressionInput.reason,
        }),
      });
      const data = await res.json();
      if (data.success && data.entry) {
        setSuppressionList((prev) => [data.entry, ...prev]);
        setSuppressionInput({ emailOrDomain: "", reason: "Competitor or manual opt-out" });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveSuppression = async (id: string) => {
    try {
      await fetch(`/api/suppression?id=${id}`, { method: "DELETE" });
      setSuppressionList((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const pendingDrafts = companies.filter((c) => c.draft && c.draft.status === "PENDING_APPROVAL");
  const approvedDrafts = companies.filter((c) => c.draft && c.draft.status === "APPROVED");
  const sentDrafts = companies.filter((c) => c.draft && c.draft.status === "SENT");
  const qualifiedLeads = companies.filter((c) => (c.icpScore || 0) >= 70);
  const totalPipelineMrr = companies.reduce((acc, c) => acc + (Number(c.deal?.valueMrr) || 0), 0);

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-[#0c1829]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#34d399] to-[#7dd3fc] flex items-center justify-center font-bold text-slate-950 text-sm shadow-lg shadow-[#34d399]/20">
            N
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-base tracking-tight text-white">NORUVA AI</span>
              <span className="text-[10px] uppercase font-semibold tracking-wider bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                Revenue Engine 0→1
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Autonomous B2B Acquisition & Conversion Platform</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Gemini AI (Free Tier)</span>
          </div>

          <button
            onClick={() => setKillSwitchActive(!killSwitchActive)}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              killSwitchActive
                ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30"
                : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{killSwitchActive ? "KILL SWITCH: ACTIVE" : "Safety Guard: Normal"}</span>
          </button>
        </div>
      </header>

      {/* Main Tabs Navigation */}
      <div className="border-b border-slate-800/60 bg-[#091424] px-6 flex space-x-1 overflow-x-auto">
        {[
          { id: "overview", label: "Executive Overview", icon: TrendingUp },
          { id: "discovery", label: "Lead Discovery & Scoring", icon: Search },
          {
            id: "approvals",
            label: "Human Review Cockpit",
            icon: FileText,
            badge: pendingDrafts.length > 0 ? pendingDrafts.length : undefined,
          },
          {
            id: "conversations",
            label: "Conversations & Inbound",
            icon: MessageSquare,
            badge: conversations.length > 0 ? conversations.length : undefined,
          },
          { id: "pipeline", label: "CRM Deal Pipeline", icon: Layers },
          {
            id: "suppression",
            label: "Suppression & Compliance",
            icon: Ban,
            badge: suppressionList.length > 0 ? suppressionList.length : undefined,
          },
          { id: "revenue", label: "Revenue & CAC Attribution", icon: DollarSign },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap relative ${
                isActive
                  ? "border-[#34d399] text-[#34d399] bg-[#34d399]/5"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="bg-amber-500 text-slate-950 font-bold text-[10px] px-1.5 py-0.2 rounded-full">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Dispatch / Notification Banner */}
      {dispatchMessage && (
        <div
          className={`px-6 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
            dispatchMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          <div className="flex items-center space-x-2">
            {dispatchMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            <span>{dispatchMessage.text}</span>
          </div>
          <button
            onClick={() => setDispatchMessage(null)}
            className="text-slate-400 hover:text-white text-xs"
          >
            &times;
          </button>
        </div>
      )}

      {/* Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>DISCOVERED PROSPECTS</span>
                  <Building2 className="w-4 h-4 text-[#7dd3fc]" />
                </div>
                <div className="text-2xl font-bold text-white">{companies.length}</div>
                <div className="text-[11px] text-emerald-400 mt-1">100% deduplicated</div>
              </div>

              <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>QUALIFIED LEADS (ICP &ge; 70)</span>
                  <Sparkles className="w-4 h-4 text-[#34d399]" />
                </div>
                <div className="text-2xl font-bold text-emerald-400">{qualifiedLeads.length}</div>
                <div className="text-[11px] text-slate-400 mt-1">Explainable AI Scoring</div>
              </div>

              <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>INBOUND CONVERSATIONS</span>
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400">{conversations.length}</div>
                <div className="text-[11px] text-slate-400 mt-1">AI Classified & Slack Alerted</div>
              </div>

              <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>PROJECTED PIPELINE MRR</span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">${totalPipelineMrr.toLocaleString()}</div>
                <div className="text-[11px] text-slate-400 mt-1">From active qualified deals</div>
              </div>
            </div>

            {/* Strategic Workflow Flowchart */}
            <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center space-x-2">
                <Zap className="w-4 h-4 text-[#34d399]" />
                <span>Autonomous Lifecycle State Engine</span>
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
                {[
                  { step: "1. Discover", desc: "Data APIs & Signals", status: "Active" },
                  { step: "2. Qualify", desc: "0-100 ICP Scoring", status: "Active" },
                  { step: "3. Review", desc: "Human Sign-off", status: "Active" },
                  { step: "4. Dispatch", desc: "Safe Email Delivery", status: "Active" },
                  { step: "5. Reply AI", desc: "Intent & Slack Alert", status: "Active" },
                  { step: "6. Retain", desc: "Stripe Subscriptions", status: "Sprint 4" },
                ].map((item, i) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
                    <div className="text-xs font-bold text-[#7dd3fc]">{item.step}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{item.desc}</div>
                    <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* High Fit Prospects Ready for Action */}
            <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-200">High-Fit Prospects (Score &ge; 70)</h3>
                <button
                  onClick={() => setActiveTab("discovery")}
                  className="text-xs text-[#34d399] hover:underline flex items-center"
                >
                  <span>Ingest New Prospect</span>
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 border-b border-slate-800 bg-slate-900/40">
                    <tr>
                      <th className="py-2.5 px-3">Company</th>
                      <th className="py-2.5 px-3">Target Pillar</th>
                      <th className="py-2.5 px-3">Hiring Signal</th>
                      <th className="py-2.5 px-3">ICP Score</th>
                      <th className="py-2.5 px-3">Outreach Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {companies.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 font-medium text-white">
                          <div>{c.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{c.domain}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            {c.recommendedPillar?.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 max-w-xs truncate">{c.hiringSignals}</td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-emerald-400">{c.icpScore}</span>
                          <span className="text-slate-500 text-[10px]">/100</span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              c.draft?.status === "SENT"
                                ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                                : c.draft?.status === "APPROVED"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : c.draft?.status === "REJECTED"
                                ? "bg-rose-500/10 text-rose-400"
                                : "bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {c.draft?.status || "PENDING"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => setActiveTab("approvals")}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded"
                          >
                            Cockpit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LEAD DISCOVERY & SCORING */}
        {activeTab === "discovery" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-6 lg:col-span-1 space-y-4">
              <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                <Plus className="w-4 h-4 text-[#34d399]" />
                <span>Ingest & AI-Score Prospect</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Add a target company or paste a lead. The AI agent will inspect their hiring signals and match them with Noruva’s product pillars.
              </p>

              <form onSubmit={handleAddLead} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Company Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Acme Cloud"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#34d399]"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Domain</label>
                  <input
                    type="text"
                    required
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                    placeholder="e.g. acmecloud.com"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#34d399]"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Hiring Signals / Job Openings</label>
                  <input
                    type="text"
                    value={formData.hiringSignals}
                    onChange={(e) => setFormData({ ...formData, hiringSignals: e.target.value })}
                    placeholder="e.g. Hiring 4 Remote SDRs"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#34d399]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Contact Name</label>
                    <input
                      type="text"
                      value={formData.contactName}
                      onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                      placeholder="e.g. John Doe"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#34d399]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Role / Title</label>
                    <input
                      type="text"
                      value={formData.contactTitle}
                      onChange={(e) => setFormData({ ...formData, contactTitle: e.target.value })}
                      placeholder="e.g. VP Sales"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#34d399]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Verified Email</label>
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    placeholder="e.g. john@acmecloud.com"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#34d399]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={scoringLoading}
                  className="w-full mt-2 bg-[#34d399] hover:bg-[#2fc28c] text-slate-950 font-bold py-2.5 rounded-lg flex items-center justify-center space-x-2 transition-all shadow-md shadow-[#34d399]/20"
                >
                  {scoringLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>AI Scoring in Progress...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Qualify & Generate Draft</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-6 lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Scored Leads Database</h3>
                <span className="text-xs text-slate-400">{companies.length} records</span>
              </div>

              <div className="space-y-3">
                {companies.map((c) => (
                  <div key={c.id} className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-sm">{c.name}</span>
                          <span className="text-slate-500 text-xs font-mono">({c.domain})</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            {c.recommendedPillar?.replace("_", " ")}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          <span className="text-slate-500">Contact:</span>{" "}
                          {c.contacts?.[0]?.firstName} {c.contacts?.[0]?.lastName} — {c.contacts?.[0]?.title} (
                          {c.contacts?.[0]?.email})
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-extrabold text-emerald-400">
                          {c.icpScore}
                          <span className="text-slate-500 text-xs font-normal">/100</span>
                        </div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
                          {c.icpScore >= 70 ? "HIGH FIT" : "LOW FIT"}
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-300">
                      <span className="text-[#34d399] font-semibold">AI Qualification Reasoning:</span>{" "}
                      {c.icpScoreReason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: HUMAN REVIEW & DISPATCH COCKPIT */}
        {activeTab === "approvals" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-[#34d399]" />
                  <span>Human-in-the-Loop Review & Dispatch Cockpit</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Every outbound message requires explicit human approval. Approved drafts can then be safely dispatched.
                </p>
              </div>
              <div className="flex space-x-2">
                <span className="text-xs bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full border border-amber-500/20">
                  {pendingDrafts.length} pending review
                </span>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20">
                  {approvedDrafts.length} approved
                </span>
              </div>
            </div>

            {companies.filter((c) => c.draft).length === 0 ? (
              <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-12 text-center space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h4 className="text-base font-bold text-white">No Drafts in Queue</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Add new leads to trigger personalized AI outreach sequences.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {companies
                  .filter((c) => c.draft)
                  .map((c) => {
                    const status = c.draft.status;
                    const isSending = sendingDraftId === c.draft.id;
                    return (
                      <div
                        key={c.id}
                        className={`bg-[#0c1b2e] border rounded-xl p-5 flex flex-col justify-between space-y-4 transition-all ${
                          status === "SENT"
                            ? "border-sky-500/30 opacity-80"
                            : status === "APPROVED"
                            ? "border-emerald-500/40 shadow-lg shadow-emerald-500/5"
                            : "border-slate-800"
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div>
                              <div className="font-bold text-white text-sm">{c.name}</div>
                              <div className="text-xs text-slate-400">
                                To: {c.contacts?.[0]?.firstName} {c.contacts?.[0]?.lastName} ({c.contacts?.[0]?.email})
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-[#34d399] bg-[#34d399]/10 px-2 py-0.5 rounded">
                                Score: {c.icpScore}
                              </span>
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                  status === "SENT"
                                    ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                                    : status === "APPROVED"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : status === "REJECTED"
                                    ? "bg-rose-500/10 text-rose-400"
                                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                }`}
                              >
                                {status}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-[11px] font-semibold text-slate-400">SUBJECT:</div>
                            <div className="text-xs font-medium text-white bg-slate-900/80 p-2 rounded border border-slate-800">
                              {c.draft?.subject}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-[11px] font-semibold text-slate-400">EMAIL BODY:</div>
                            <div className="text-xs text-slate-300 bg-slate-900/80 p-3 rounded border border-slate-800 whitespace-pre-line leading-relaxed font-sans max-h-48 overflow-y-auto">
                              {c.draft?.body}
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800">
                          {status === "PENDING_APPROVAL" && (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleApprove(c.draft.id, "APPROVE")}
                                className="flex-1 bg-[#34d399] hover:bg-[#2fc28c] text-slate-950 font-bold py-2 rounded-lg text-xs flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-[#34d399]/10"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Approve Outreach</span>
                              </button>

                              <button
                                onClick={() => handleApprove(c.draft.id, "REJECT")}
                                className="bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-800 py-2 px-3 rounded-lg text-xs transition-colors"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          )}

                          {status === "APPROVED" && (
                            <button
                              onClick={() => handleDispatch(c)}
                              disabled={isSending}
                              className="w-full bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold py-2 rounded-lg text-xs flex items-center justify-center space-x-2 transition-all shadow-md shadow-sky-500/20"
                            >
                              {isSending ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  <span>Dispatching Email...</span>
                                </>
                              ) : (
                                <>
                                  <Send className="w-4 h-4" />
                                  <span>Dispatch Email Now (Safe Send)</span>
                                </>
                              )}
                            </button>
                          )}

                          {status === "SENT" && (
                            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/50 p-2 rounded">
                              <span className="flex items-center space-x-1 text-sky-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Dispatched to inbox</span>
                              </span>
                              <span className="text-[10px] text-slate-500">Pipeline: Contacted</span>
                            </div>
                          )}

                          {status === "REJECTED" && (
                            <div className="text-xs text-rose-400 bg-rose-950/20 p-2 rounded text-center">
                              Draft Rejected by Reviewer
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: CONVERSATIONS & INBOUND INTELLIGENCE */}
        {activeTab === "conversations" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Interactive Inbound Reply Simulator */}
            <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-6 lg:col-span-1 space-y-4">
              <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Simulate Prospect Reply</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Test how the Conversation Agent reads incoming replies, categorizes buying intent, notifies Slack, and drafts responses.
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Target Prospect</label>
                  <select
                    value={simulatorInput.selectedLeadId}
                    onChange={(e) => setSimulatorInput({ ...simulatorInput, selectedLeadId: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#34d399]"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.contacts?.[0]?.firstName} ({c.contacts?.[0]?.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Quick Presets</label>
                  <div className="flex flex-col space-y-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleSimulateReply(
                          "Hi! This timing is perfect—we just hired 4 new reps and ramping them is brutal. Can we do a 15-minute call Thursday morning?"
                        )
                      }
                      className="text-left px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/20 transition-colors"
                    >
                      🔥 Preset: "Interested / Book 15-min call"
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleSimulateReply(
                          "We already use Gong and Otter.ai across the team, how are you different and why switch?"
                        )
                      }
                      className="text-left px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-sky-400 border border-sky-500/20 transition-colors"
                    >
                      💡 Preset: "Competitor objection (Gong / Otter)"
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleSimulateReply(
                          "Please unsubscribe me and remove our company from your contact list immediately."
                        )
                      }
                      className="text-left px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-rose-400 border border-rose-500/20 transition-colors"
                    >
                      🛑 Preset: "Unsubscribe / Opt out"
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Custom Reply Text</label>
                  <textarea
                    rows={4}
                    value={simulatorInput.customReply}
                    onChange={(e) => setSimulatorInput({ ...simulatorInput, customReply: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-[#34d399]"
                    placeholder="Type what the prospect wrote..."
                  />
                </div>

                <button
                  type="button"
                  disabled={simulatingReply}
                  onClick={() => handleSimulateReply()}
                  className="w-full bg-[#34d399] hover:bg-[#2fc28c] text-slate-950 font-bold py-2.5 rounded-lg flex items-center justify-center space-x-2 transition-all shadow-md shadow-[#34d399]/20"
                >
                  {simulatingReply ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Classifying Reply & Alerting Slack...</span>
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4" />
                      <span>Simulate Inbound Ingestion</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Active Inbound Conversations Feed */}
            <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-6 lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Conversation Inbox & Intelligence Feed</h3>
                  <p className="text-xs text-slate-400">Classified replies with sentiment and recommended responses</p>
                </div>
                <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full">
                  {conversations.length} incoming messages
                </span>
              </div>

              <div className="space-y-4">
                {conversations.map((conv) => {
                  const isHot = conv.intent === "INTERESTED";
                  const isObjection = conv.intent === "OBJECTION";
                  const isUnsub = conv.intent === "UNSUBSCRIBE";

                  return (
                    <div
                      key={conv.id}
                      className={`p-4 rounded-xl bg-slate-900/80 border space-y-3 transition-all ${
                        isHot
                          ? "border-emerald-500/40 shadow-lg shadow-emerald-500/5"
                          : isObjection
                          ? "border-amber-500/30"
                          : isUnsub
                          ? "border-rose-500/30"
                          : "border-slate-800"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-sm">{conv.companyName}</span>
                            <span className="text-slate-400 text-xs">({conv.prospectName})</span>
                            <span className="text-slate-500 text-[11px] font-mono">&lt;{conv.email}&gt;</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Received: {new Date(conv.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          {conv.slackAlerted && (
                            <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center space-x-1">
                              <Flame className="w-3 h-3" />
                              <span>Slack Alerted</span>
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              isHot
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : isObjection
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                                : isUnsub
                                ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {conv.intent} ({conv.confidence}%)
                          </span>
                        </div>
                      </div>

                      {/* Message Quote */}
                      <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-slate-200 italic">
                        "{conv.messageText}"
                      </div>

                      {/* AI Action Plan */}
                      <div className="text-[11px] text-slate-300 space-y-1">
                        <div>
                          <span className="text-sky-400 font-semibold">Recommended Action:</span>{" "}
                          {conv.recommendedAction}
                        </div>
                      </div>

                      {/* AI Suggested Reply */}
                      {conv.suggestedReply && (
                        <div className="p-3 rounded-lg bg-[#07111f] border border-slate-800/80 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[#34d399] font-semibold flex items-center space-x-1">
                              <CornerDownRight className="w-3.5 h-3.5" />
                              <span>AI Suggested Reply (Ready to Send):</span>
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed font-sans">
                            {conv.suggestedReply}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: CRM DEAL PIPELINE */}
        {activeTab === "pipeline" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">B2B Deal Pipeline & Conversion Funnel</h3>
                <p className="text-xs text-slate-400">Tracking every prospect from Qualified Lead to Won (Paid MRR)</p>
              </div>
              <div className="text-xs text-emerald-400 font-bold">
                Total Pipeline Value: ${totalPipelineMrr.toLocaleString()} / mo
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {[
                { stage: "QUALIFIED_LEAD", label: "Qualified Lead", color: "border-sky-500" },
                { stage: "CONTACTED", label: "Contacted / In Outreach", color: "border-indigo-500" },
                { stage: "MEETING_BOOKED", label: "Meeting Booked", color: "border-amber-500" },
                { stage: "TRIAL_ACTIVE", label: "Free Trial Active", color: "border-purple-500" },
                { stage: "WON_PAID", label: "Won & Paid (Stripe)", color: "border-emerald-500" },
              ].map((col) => {
                const dealsInCol = companies.filter((c) => (c.deal?.stage || "QUALIFIED_LEAD") === col.stage);
                return (
                  <div key={col.stage} className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-3 flex flex-col space-y-3 min-h-[360px]">
                    <div className={`border-t-2 ${col.color} pt-2 flex items-center justify-between`}>
                      <span className="text-xs font-bold text-white">{col.label}</span>
                      <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-mono">
                        {dealsInCol.length}
                      </span>
                    </div>

                    <div className="flex-1 space-y-2">
                      {dealsInCol.map((c) => (
                        <div key={c.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1 shadow-sm">
                          <div className="font-bold text-white">{c.name}</div>
                          <div className="text-slate-400 text-[11px]">{c.contacts?.[0]?.firstName} {c.contacts?.[0]?.lastName}</div>
                          <div className="text-emerald-400 font-mono font-semibold pt-1">
                            ${c.deal?.valueMrr || 500} / mo
                          </div>
                        </div>
                      ))}
                      {dealsInCol.length === 0 && (
                        <div className="text-center py-8 text-[11px] text-slate-600">No deals in this stage</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 6: SUPPRESSION & COMPLIANCE */}
        {activeTab === "suppression" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-6 lg:col-span-1 space-y-4">
              <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                <Ban className="w-4 h-4 text-rose-400" />
                <span>Add Suppression Rule</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Add an email address or an entire company domain to block all outbound messages. This guarantees CAN-SPAM and GDPR compliance.
              </p>

              <form onSubmit={handleAddSuppression} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Email or Domain to Block</label>
                  <input
                    type="text"
                    required
                    value={suppressionInput.emailOrDomain}
                    onChange={(e) => setSuppressionInput({ ...suppressionInput, emailOrDomain: e.target.value })}
                    placeholder="e.g. competitor.com or badlead@domain.com"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-rose-400 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Reason</label>
                  <input
                    type="text"
                    value={suppressionInput.reason}
                    onChange={(e) => setSuppressionInput({ ...suppressionInput, reason: e.target.value })}
                    placeholder="e.g. Competitor / Requested opt-out"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-rose-400"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 font-bold py-2 rounded-lg flex items-center justify-center space-x-2 transition-colors"
                >
                  <Ban className="w-4 h-4" />
                  <span>Block from Outreach</span>
                </button>
              </form>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300">Automatic Protections:</div>
                <div>• All 1-click unsubscribe links feed directly into this table.</div>
                <div>• Inbound "unsubscribe" replies auto-suppress the sender.</div>
                <div>• Dispatcher auto-aborts if recipient or domain matches.</div>
              </div>
            </div>

            <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-6 lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Active Suppression List</h3>
                <span className="text-xs text-slate-400">{suppressionList.length} suppressed entities</span>
              </div>

              <div className="space-y-2">
                {suppressionList.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono text-rose-400 font-semibold">
                        {item.email || `@${item.domain}`}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Reason: {item.reason} • Added: {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveSuppression(item.id)}
                      className="text-slate-500 hover:text-rose-400 p-1.5 rounded hover:bg-slate-800 transition-colors"
                      title="Remove from suppression"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: REVENUE & ATTRIBUTION */}
        {activeTab === "revenue" && (
          <div className="space-y-6">
            <div className="bg-[#0c1b2e] border border-slate-800 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-emerald-400" />
                <span>Unit Economics & Revenue Attribution (0→1 Pilot)</span>
              </h3>
              <p className="text-xs text-slate-400">
                Unlike simple marketing tools, Noruva Engine tracks actual revenue, API operational spend, and Customer Acquisition Cost (CAC).
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400 font-medium">Monthly Operating Cost</div>
                  <div className="text-2xl font-bold text-white mt-1">$0.00</div>
                  <div className="text-[11px] text-emerald-400 mt-1">Running on Gemini Free Tier</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400 font-medium">Customer Acquisition Cost (CAC)</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-1">$0.00</div>
                  <div className="text-[11px] text-slate-400 mt-1">Zero ad spend or paid data</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <div className="text-xs text-slate-400 font-medium">Average SaaS Deal Size</div>
                  <div className="text-2xl font-bold text-white mt-1">$500 / mo</div>
                  <div className="text-[11px] text-slate-400 mt-1">$6,000 Annual Value (ARR)</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
