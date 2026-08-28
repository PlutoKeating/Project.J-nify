import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ReleaseNote({ body }: { body: string }) {
  return (
    <div
      className="max-w-none space-y-3 text-sm leading-relaxed text-sub [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:rounded [&_code]:bg-paper [&_code]:px-1 [&_code]:py-0.5 [&_a]:text-accent [&_a]:underline"
      translate="no"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
