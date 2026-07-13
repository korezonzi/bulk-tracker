// Static disclaimer shown under every AI health analysis result.
// Kept out of AI output so the wording is guaranteed and costs no tokens.
export function MedicalDisclaimer() {
  return (
    <p className="text-[10px] text-muted leading-relaxed">
      ※ この結果はAIによる情報の整理であり、医療診断ではありません。
      症状が続く・悪化する場合は皮膚科などの医療機関を受診してください。
    </p>
  );
}
