// Application questions and documents per partner type, mirrored from the review prototype.
export type RQ = [key: string, label: string, kind: "number" | "text" | "yesno" | "excl"];
export const REG_Q: Record<string, RQ[]> = {
  DLR: [["years", "How many years of business experience do you have?", "number"], ["outlets", "How many retail outlets do you currently serve?", "number"], ["products", "What products do you currently distribute or sell?", "text"], ["potential", "Estimated monthly sales potential (₹ lakh)", "number"], ["team", "Do you have an existing sales team?", "yesno"], ["wc", "Working capital as a multiple of an opening order (x)", "number"], ["excl", "Exclusive or non-exclusive arrangement?", "excl"]],
  DST: [["years", "Years of business experience", "number"], ["districts", "How many districts can you cover?", "number"], ["dealers", "How many dealers can you appoint?", "number"], ["outlets", "Retail outlets in your existing network", "number"], ["warehouse", "Do you have warehouse facilities?", "yesno"], ["capacity", "Monthly distribution capacity (litres)", "number"], ["capital", "Available working capital (₹ lakh)", "number"], ["logistics", "Transport and logistics arrangements in place?", "yesno"], ["commit", "Expected monthly purchase commitment (₹ lakh)", "number"], ["team", "Existing sales team?", "yesno"], ["wc", "Working capital as a multiple of an opening order (x)", "number"], ["excl", "Exclusive or non-exclusive arrangement?", "excl"]],
  STK: [["years", "Years of business experience", "number"], ["network", "Existing distribution network (dealers + distributors)", "number"], ["storage", "Expected stock-holding capacity (litres)", "number"], ["logistics", "Logistics capacity (vehicles / month)", "number"], ["capital", "Available working capital (₹ lakh)", "number"], ["coverage", "Geographic coverage (districts)", "number"], ["rel", "Current dealer / distributor relationships (names)", "text"], ["outlets", "Retail outlets reached", "number"], ["wc", "Working capital as a multiple of an opening order (x)", "number"]],
  INS: [["category", "Business category (hotel, hospital, factory, office…)", "text"], ["gst", "GST number", "text"], ["monthly", "Estimated monthly consumption (litres)", "number"], ["req", "Product requirements", "text"], ["delivery", "Delivery requirements (site, timing)", "text"]],
};
const BASE = ["Company / firm registration", "PAN card", "Address proof of business", "Bank statement (6 months)", "Authorised person ID"];
export const REG_DOCS: Record<string, string[]> = {
  DLR: BASE,
  DST: [...BASE, "Warehouse proof or lease", "Financial statements (2 years)", "Dealer network list"],
  STK: [...BASE, "Warehouse photos and lease", "Financial statements (2 years)", "Fleet / logistics details"],
  INS: ["Registration / licence", "GST certificate", "Authority letter of contact person", "Site address proof"],
};
export const yesnoOpts = ["Yes", "No"]; export const exclOpts = ["Non-exclusive", "Exclusive"];
