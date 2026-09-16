/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
}
