/** Remembers, in a cookie shared by the website and the portal, that this browser belongs to a partner or applicant. */
const NAME = "el_partner";
const domain = () => (typeof location !== "undefined" && location.hostname.endsWith("earthlabsproducts.com") ? ";domain=.earthlabsproducts.com" : "");
export function markPartner() { try { document.cookie = `${NAME}=1;path=/;max-age=31536000;SameSite=Lax${domain()}`; } catch { /* cookies blocked */ } }
export function isKnownPartner() { try { return document.cookie.split("; ").some((c) => c === `${NAME}=1`); } catch { return false; } }
