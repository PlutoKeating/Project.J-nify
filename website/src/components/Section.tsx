import type { ReactNode } from 'react';

export default function Section({
  eyebrow,
  title,
  sub,
  children,
  id,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mx-auto max-w-3xl scroll-mt-24 px-5 py-16 sm:py-20">
      {eyebrow && (
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-accent">{eyebrow}</p>
      )}
      <h2 className="text-[26px] font-extrabold leading-tight text-ink sm:text-3xl">{title}</h2>
      {sub && <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-sub">{sub}</p>}
      {children && <div className="mt-10">{children}</div>}
    </section>
  );
}
