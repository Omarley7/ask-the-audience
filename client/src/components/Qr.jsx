export default function Qr({ dataUrl, alt = "QR til at deltage" }) {
  if (!dataUrl) return null;
  return (
    <img
      src={dataUrl}
      alt={alt}
      style={{
        width: "100%",
        maxWidth: 240,
        borderRadius: 12,
        border: "1px solid #2a3a7d",
        boxShadow: "0 0 20px #e3c26b33",
      }}
    />
  );
}
