/** Static export so it can be hosted anywhere (GitHub Pages, Vercel, Cloudflare Pages).
 *  PARTNER_BASE_PATH is "/partner" when served under www.earthlabsproducts.com/partner or a Pages sub-path, empty on a sub-domain. */
const basePath = process.env.PARTNER_BASE_PATH ?? "";
export default { output: "export", basePath, assetPrefix: basePath || undefined, trailingSlash: true, images: { unoptimized: true }, env: { NEXT_PUBLIC_BASE: basePath } };
