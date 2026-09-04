import { useEffect, useId } from 'react';

// Shared modal shell: Esc-to-close, backdrop-click-to-close, and proper
// dialog semantics (role="dialog", aria-modal, aria-labelledby) in one place
// instead of duplicated per-modal. `title` renders the heading and wires up
// aria-labelledby automatically; pass `titleId` only if you render your own
// heading element and need to point aria-labelledby at it instead.
function Modal({ onClose, children, title, titleId, maxWidth = 'max-w-md', scrollable = false }) {
  const generatedId = useId();
  const labelId = titleId || (title ? generatedId : undefined);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={`bg-white rounded-2xl shadow-xl border border-slate-200/60 p-6 w-full ${maxWidth} ${scrollable ? 'max-h-[90vh] overflow-y-auto' : ''}`}
      >
        {title && (
          <h3 id={labelId} className="text-lg font-bold text-slate-800 mb-4">
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}

export default Modal;
