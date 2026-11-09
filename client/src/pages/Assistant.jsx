import { useEffect, useRef, useState } from 'react';
import { Bot, Send, ShieldCheck } from 'lucide-react';
import { api, newRequestId, rupees } from '../api.js';
import { Alert, Button, Card, inputClass, PageTitle } from '../components/ui.jsx';

const SUGGESTIONS = [
  "What's my balance?",
  'How much did I spend on food last month?',
  'Show my last 5 transactions',
  'Send ₹500 to Rahul for dinner',
];

const GREETING = {
  role: 'assistant',
  text: "Hi! I'm your BankAI assistant. Ask me about your balance, spending or transactions. I can also prepare a payment for you to confirm.",
};

// The confirm card for a payment the AI prepared. The AI cannot send money: only this button can.
function DraftCard({ draft, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const res = await api('/transfers', {
        method: 'POST',
        body: { requestId: draft.requestId, beneficiaryId: draft.payeeId, amount: draft.amount, note: draft.note },
      });
      onDone(res.status === 'completed' ? `Done! ${rupees(draft.amountPaise)} sent to ${draft.payeeName}.` : res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ml-11 max-w-sm rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
        <ShieldCheck className="h-4 w-4" /> Confirm this payment
      </p>
      <p className="mt-2 text-2xl font-semibold">{rupees(draft.amountPaise)}</p>
      <p className="text-sm text-slate-600">
        To {draft.payeeName} ({draft.holderName}, {draft.accountMasked})
      </p>
      {draft.note && <p className="text-sm text-slate-600">Note: {draft.note}</p>}
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      <div className="mt-3 flex gap-2">
        <Button onClick={confirm} busy={busy}>
          Confirm & send
        </Button>
        <Button variant="secondary" onClick={() => onDone('Payment cancelled. Nothing was sent.')} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function Assistant() {
  const [messages, setMessages] = useState([GREETING]);
  const [draft, setDraft] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, draft, busy]);

  async function ask(text) {
    if (!text.trim() || busy) return;
    const next = [...messages, { role: 'user', text: text.trim() }];
    setMessages(next);
    setInput('');
    setDraft(null);
    setError('');
    setBusy(true);
    try {
      const res = await api('/ai/chat', { method: 'POST', body: { messages: next } });
      setMessages([...next, { role: 'assistant', text: res.reply }]);
      // The same requestId is reused if Confirm is clicked twice, so it can only pay once.
      if (res.draft) setDraft({ ...res.draft, requestId: newRequestId() });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function finishDraft(text) {
    setDraft(null);
    setMessages((m) => [...m, { role: 'assistant', text }]);
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col md:h-[calc(100vh-4rem)]">
      <PageTitle title="AI Assistant" subtitle="Answers come from your real account data through safe, read-only tools." />

      <Card className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-sm text-white">{m.text}</p>
              </div>
            ) : (
              <div key={i} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                  <Bot className="h-4 w-4" />
                </div>
                <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2 text-sm text-slate-800">{m.text}</p>
              </div>
            ),
          )}
          {draft && <DraftCard draft={draft} onDone={finishDraft} />}
          {busy && <p className="ml-11 text-sm text-slate-400">Assistant is thinking...</p>}
          {error && <Alert tone="error">{error}</Alert>}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => ask(s)}
                disabled={busy}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex gap-2"
          >
            <input className={inputClass} placeholder="Ask about your money..." value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} />
            <Button type="submit" disabled={busy || !input.trim()} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
