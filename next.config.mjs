/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  // Basic safety headers: no other site can show the app inside a frame, the browser never guesses file types,
  // other sites never see the app's addresses, and the camera, microphone and location stay off.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default nextConfig;
