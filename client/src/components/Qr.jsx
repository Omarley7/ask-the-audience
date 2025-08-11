export default function Qr({ dataUrl, alt = "QR til at deltage" }) {
  if (!dataUrl) return null;
  return (
    <img
      src={dataUrl}
      alt={alt}
      className="shadow-glow w-full max-w-[240px] rounded-xl border border-[#2a3a7d]"
    />
  );
}
