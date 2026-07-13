"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  CONSULT_STATUS_LABELS,
  type ConsultCase,
  type ConsultCaseStatus,
} from "@/lib/types";

const STATUS_STYLES: Record<ConsultCaseStatus, string> = {
  active: "bg-accent/12 text-accent",
  monitoring: "bg-warning/12 text-warning",
  resolved: "bg-card-hover text-muted",
};

export default function ConsultListPage() {
  const [cases, setCases] = useState<ConsultCase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("consult_cases")
        .select("*")
        .order("updated_at", { ascending: false });
      if (!active) return;
      setCases(data ?? []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeCases = cases.filter((c) => c.status !== "resolved");
  const resolvedCases = cases.filter((c) => c.status === "resolved");

  return (
    <div className="py-6 md:py-10 space-y-5 md:space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          🩺 からだ相談
        </h1>
        <Link
          href="/consult/new"
          className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-semibold active:scale-[0.97]"
        >
          + 新しい相談
        </Link>
      </div>

      <p className="text-xs text-muted -mt-2">
        気になる症状を部位ごとに記録して、経過を追いながらAIと整理できます
      </p>

      {cases.length === 0 && (
        <div className="bg-card rounded-xl p-8 text-center">
          <p className="text-4xl mb-3">🩺</p>
          <p className="font-medium">まだ相談がありません</p>
          <p className="text-xs text-muted mt-1 mb-4">
            足裏の皮むけ、肌の異変など、気になっていることを写真で相談してみましょう
          </p>
          <Link
            href="/consult/new"
            className="inline-block bg-accent text-white px-6 py-3 rounded-lg font-semibold text-sm active:scale-[0.97]"
          >
            最初の相談を始める
          </Link>
        </div>
      )}

      {activeCases.length > 0 && (
        <section className="space-y-2">
          {activeCases.map((c) => (
            <CaseCard key={c.id} consultCase={c} />
          ))}
        </section>
      )}

      {resolvedCases.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">解決済み</h2>
          {resolvedCases.map((c) => (
            <CaseCard key={c.id} consultCase={c} />
          ))}
        </section>
      )}
    </div>
  );
}

function CaseCard({ consultCase }: { consultCase: ConsultCase }) {
  const isResolved = consultCase.status === "resolved";

  return (
    <Link
      href={`/consult/${consultCase.id}`}
      className={`block bg-card rounded-xl p-4 card-hover ${isResolved ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[consultCase.status]}`}
        >
          {CONSULT_STATUS_LABELS[consultCase.status]}
        </span>
        <span className="text-[10px] text-muted">{consultCase.body_area}</span>
        {consultCase.started_on && (
          <span className="text-[10px] text-muted">
            {consultCase.started_on} 頃から
          </span>
        )}
      </div>
      <p className="text-base font-medium mt-1">{consultCase.title}</p>
      {consultCase.summary && (
        <p className="text-xs text-muted mt-1 line-clamp-2">{consultCase.summary}</p>
      )}
      <p className="text-[10px] text-muted mt-2">
        最終更新: {consultCase.updated_at.slice(0, 10)}
      </p>
    </Link>
  );
}
