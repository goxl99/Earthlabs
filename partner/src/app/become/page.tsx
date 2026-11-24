import Link from "next/link";
import { Hero, Journey, PathCards, PublicTop } from "@/components/Public";

export const metadata = { title: "Become an EarthLabs Partner", description: "Become an authorised EarthLabs dealer or distributor. Register online and track your application." };
const WHY: [string, string, string][] = [
  ["🌿", "A brand that heals, not harms", "Herbal hand wash and eco-cleaning products rooted in Indian heritage and built for global markets."],
  ["🛡️", "Protected, fair territory", "Authorisation is by district. Everything is recorded, so there are no side deals and no surprises."],
  ["📈", "A clear way to grow", "Monthly targets and a 100-point score show exactly what moves you from Dealer to Distributor."],
  ["📜", "Verifiable credentials", "A signed agreement and a partner certificate with a QR code that anyone can check."],
];
const FAQ: [string, string][] = [
  ["Does registering mean I can start trading?", "No. Every application is verified and approved by EarthLabs management first. You can order only after approval and a signed agreement."],
  ["What documents will I need?", "Identity and business proof, GST details if you have them, and address proof. The form lists the exact documents for the type you pick."],
  ["Can a dealer become a distributor?", "Yes. Performance decides it. A partner who keeps hitting targets is assessed for the next step."],
  ["How do I follow my application?", "Use Track application with your reference and e-mail. You will see each step, and we tell you if we need anything."],
];
export default function Become() {
  return (<div className="pub"><PublicTop base="../" />
    <Hero eyebrow="EARTHLABS · PARTNER NETWORK" title="Grow with the brand that heals, not harms." stats={[["34", "Districts"], ["5", "Growth steps"], ["100", "Point score"]]}>
      <p>Join EarthLabs as an authorised partner and build a business on herbal hand wash and eco-cleaning products. Choose your path below and register online in a few minutes.</p>
      <div className="row" style={{ marginTop: 22 }}><Link className="btn gold-fill" href="../register/?type=DLR">Become a Dealer</Link><Link className="btn ghost" href="../register/?type=DST">Become a Distributor</Link></div>
    </Hero>
    <div className="sec-h"><div className="eyebrow dk">CHOOSE YOUR PATH</div><h2>How would you like to work with us?</h2></div>
    <PathCards base="../" />
    <div className="sec-h"><div className="eyebrow dk">WHY EARTHLABS</div><h2>Built for partners who want to last</h2></div>
    <div className="grid g2" style={{ maxWidth: 880, margin: "0 auto" }}>{WHY.map(([ic, t, d]) => <div className="card" key={t}><div style={{ fontSize: 26 }} aria-hidden="true">{ic}</div><h2 style={{ fontSize: 19 }}>{t}</h2><p className="mini" style={{ fontSize: 13.5 }}>{d}</p></div>)}</div>
    <Journey />
    <div className="sec-h"><div className="eyebrow dk">GOOD TO KNOW</div><h2>Questions before you apply</h2></div>
    <div style={{ maxWidth: 780, margin: "0 auto" }}>{FAQ.map(([q, a]) => <details className="card" key={q} style={{ marginBottom: 10, padding: "14px 18px" }}><summary style={{ fontWeight: 700, color: "var(--teal)", cursor: "pointer" }}>{q}</summary><p style={{ marginBottom: 0 }}>{a}</p></details>)}</div>
    <div className="card" style={{ maxWidth: 780, margin: "28px auto 0", textAlign: "center" }}><h2>Ready to start?</h2><p>It takes a few minutes. You can track your application at any time.</p>
      <div className="row" style={{ justifyContent: "center" }}><Link className="btn" href="../register/?type=DLR">Register as a Dealer</Link><Link className="btn" href="../register/?type=DST">Register as a Distributor</Link><Link className="btn out" href="../">Partner sign-in</Link></div></div>
  </div>);
}
