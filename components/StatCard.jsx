export default function StatCard({ label, value, sub, color }) {
  return (
    <div className="border border-[#1F1F1F] bg-[#0A0A0A] p-5 flex-1 min-w-0">
      <p className="font-dm-mono text-[10px] text-[#5A5A5A] tracking-[0.15em] uppercase mb-2">{label}</p>
      <p
        className="font-plus text-[22px] md:text-[28px] font-bold tracking-tight tabular-nums"
        style={{ color: color || '#FFFFFF' }}
      >
        {value}
      </p>
      {sub && <p className="font-dm-mono text-[11px] text-[#5A5A5A] mt-1">{sub}</p>}
    </div>
  );
}
