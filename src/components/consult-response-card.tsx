"use client";

import { MedicalDisclaimer } from "@/components/medical-disclaimer";
import type {
  ConsultAiResponse,
  ConsultLikelihood,
  ConsultUrgency,
} from "@/lib/types";

const LIKELIHOOD_STYLES: Record<ConsultLikelihood, string> = {
  高: "bg-error/12 text-error",
  中: "bg-warning/12 text-warning",
  低: "bg-card-hover text-muted",
};

const URGENCY_LABELS: Record<ConsultUrgency, string> = {
  routine: "急ぎではない",
  soon: "近いうちに",
  urgent: "早急に",
};

// Renders a full AI consult response (possibilities / self-care / red flags / see doctor).
export function ConsultResponseCard({ response }: { response: ConsultAiResponse }) {
  return (
    <div className="space-y-3">
      {/* Possibilities */}
      <div className="bg-card rounded-xl p-4">
        <h3 className="text-base font-medium mb-2">🔍 考えられる可能性</h3>
        <div className="space-y-3">
          {response.possibilities.map((p, i) => (
            <div key={i}>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${LIKELIHOOD_STYLES[p.likelihood] ?? LIKELIHOOD_STYLES.低}`}
                >
                  確度: {p.likelihood}
                </span>
                <span className="text-sm font-medium">{p.name}</span>
              </div>
              <p className="text-xs text-muted mt-1">{p.rationale}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Progress note (follow-up only) */}
      {response.progress_note && (
        <div className="bg-card rounded-xl p-4">
          <h3 className="text-base font-medium mb-1">📈 前回からの変化</h3>
          <p className="text-sm text-foreground/90">{response.progress_note}</p>
        </div>
      )}

      {/* Self care */}
      {response.self_care.length > 0 && (
        <div className="bg-card rounded-xl p-4">
          <h3 className="text-base font-medium mb-2">🏠 セルフケアの選択肢</h3>
          <ul className="space-y-1.5">
            {response.self_care.map((item, i) => (
              <li key={i} className="text-sm text-foreground/90 flex gap-2">
                <span className="text-muted shrink-0">・</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Red flags */}
      {response.red_flags.length > 0 && (
        <div className="bg-card rounded-xl p-4 border border-warning/30">
          <h3 className="text-base font-medium mb-2 text-warning">
            ⚠️ こうなったらすぐ受診
          </h3>
          <ul className="space-y-1.5">
            {response.red_flags.map((flag, i) => (
              <li key={i} className="text-sm text-foreground/90 flex gap-2">
                <span className="text-warning shrink-0">・</span>
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* See doctor */}
      <div
        className={`rounded-xl p-4 ${
          response.see_doctor.recommended
            ? "bg-accent/12 border border-accent/30"
            : "bg-card"
        }`}
      >
        <h3 className="text-base font-medium mb-1">
          🏥 受診の目安:{" "}
          {response.see_doctor.recommended
            ? `${response.see_doctor.department}へ（${URGENCY_LABELS[response.see_doctor.urgency] ?? response.see_doctor.urgency}）`
            : "今すぐの受診は不要"}
        </h3>
        <p className="text-sm text-foreground/90">{response.see_doctor.reason}</p>
      </div>

      <MedicalDisclaimer />
    </div>
  );
}
