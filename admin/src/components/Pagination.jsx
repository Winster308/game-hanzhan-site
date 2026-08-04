export default function Pagination({ page, total, pageSize, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const items = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) items.push(i);
    else if (items[items.length - 1] !== '...') items.push('...');
  }
  return (
    <div className="pagination">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
      {items.map((i, idx) =>
        i === '...' ? <span key={`e${idx}`} className="muted small" style={{ alignSelf: 'center' }}>···</span>
          : <button key={i} className={i === page ? 'active' : ''} onClick={() => onChange(i)}>{i}</button>
      )}
      <button disabled={page >= pages} onClick={() => onChange(page + 1)}>下一页</button>
    </div>
  );
}
