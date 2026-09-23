/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // La landing es un HTML estático (public/landing.html) con Tailwind por CDN.
  // Servimos ese archivo en la raíz "/" para que el fetch de los formularios
  // llame a /api/leads en el MISMO origen (sin CORS). El formulario de prueba
  // de desarrollo queda en /test.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/landing.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
