export default function ScenarioCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-3xl border border-line bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        <h3 className="text-lg font-extrabold text-ink">{title}</h3>
      </div>
      <p className="mt-3 text-[15px] leading-[1.8] text-sub" translate="no">
        {body}
      </p>
    </article>
  );
}
