import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the Zama mark on its teal tile. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c8f81" }}>
        <svg width="150" height="150" viewBox="0 0 32 32">
          <path d="M9.5 10.5h13L9.5 21.5h13" fill="none" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9.5" cy="10.5" r="2.6" fill="#ff8a3d" stroke="#ffffff" strokeWidth="1.2" />
          <circle cx="22.5" cy="21.5" r="2.6" fill="#a3e635" stroke="#ffffff" strokeWidth="1.2" />
        </svg>
      </div>
    ),
    size,
  );
}
