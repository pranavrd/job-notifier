// Role and position-type classification from a job title (plus optional
// structured hints from the ATS, e.g. Lever `commitment` / Ashby `employmentType`).
//
// Role buckets (exactly what the UI filters on):
//   Software · AI/ML · Backend · Cloud · Other
// "Other" intentionally captures Full-Stack, Forward-Deployed (FDE) and Agentic-AI roles.

export const ROLES = ["Software", "AI/ML", "Backend", "Cloud", "Other"];
export const POSITIONS = ["Internship", "Full-Time", "New Grad", "Contract", "Co-op"];

// Titles that are NOT software/AI roles even when they contain "engineer"
// (sales, ops, hardware/mechanical, support, PM, design, etc.). These are
// excluded from the feed entirely — this is a tech & AI board.
const NON_TECH = /(account executive|\bsales\b|business development|partnerships?|\bpartner\b|marketing|\brecruit|talent acquisition|people ops|human resources|\bhr\b|\bfinance\b|financial analyst|accountant|controller|\blegal\b|counsel|attorney|paralegal|customer success|customer support|support (specialist|engineer|agent|representative)|solutions engineer|sales engineer|field (service|engineer)|office manager|facilities|administrative|executive assistant|receptionist|\bnurse\b|clinical|physician|warehouse|\bdriver\b|barista|mechanical|electrical|\bhardware\b|firmware|\bcivil\b|chemical|biomedical|optical|\brf\b|aerospace|structural|manufacturing|industrial|materials|controls engineer|test technician|product manager|program manager|project manager|\bdesigner\b|\bux\b|\bui\/ux|content writer|copywriter|\beditor\b|community manager|social media|operations manager|supply chain|logistics|procurement|purchasing|real estate|construction|maintenance)/;

export function classifyRole(title = "") {
  const t = ` ${title.toLowerCase()} `;

  if (NON_TECH.test(t)) return null; // not a role this board covers

  // "Other" is reserved for these per product spec — even when they mention AI.
  if (/(full[\s-]?stack|forward[\s-]?deployed|\bfde\b|agentic)/.test(t)) return "Other";

  if (/(machine learning|\bml\b|\bai\b|a\.i\.|deep learning|\bllm\b|\bnlp\b|computer vision|data scien|research scientist|research engineer|\bmle\b|generative|applied scientist|ml ?ops)/.test(t))
    return "AI/ML";

  if (/(cloud|devops|\bsre\b|site reliability|infrastructure|\binfra\b|kubernetes|platform engineer|reliability|observability)/.test(t))
    return "Cloud";

  if (/(back[\s-]?end|distributed systems|server[\s-]?side|services engineer|api engineer|database engineer)/.test(t))
    return "Backend";

  if (/(software|\bswe\b|developer|front[\s-]?end|mobile engineer|\bios\b|android|programmer|security engineer|\bengineer\b|engineering)/.test(t))
    return "Software";

  return null; // no tech signal → drop it
}

export function classifyPosition(title = "", hint = "") {
  const t = ` ${title.toLowerCase()} ${String(hint).toLowerCase()} `;

  if (/(\bintern\b|internship)/.test(t)) return "Internship";
  if (/(co[\s-]?op)/.test(t)) return "Co-op";
  if (/(contract|contractor|temporary|freelance|fixed[\s-]?term|part[\s-]?time)/.test(t)) return "Contract";
  if (/(new[\s-]?grad|new graduate|university grad|early career|early[\s-]?talent|entry[\s-]?level|campus|graduate (program|programme|engineer|developer|scheme|analyst)|\bgrad\b|rotational)/.test(t))
    return "New Grad";

  return "Full-Time";
}

// Best-effort country detection so the country channels keep working.
const CA_HINTS = /(canada|\bon\b|ontario|\bbc\b|british columbia|\bqc\b|quebec|\bab\b|alberta|toronto|vancouver|montreal|ottawa|waterloo|calgary|mississauga|kitchener)/;
const US_HINTS = /(united states|\busa?\b|\bny\b|new york|\bca\b|california|san francisco|seattle|austin|boston|chicago|texas|\bwa\b|\bma\b|\btx\b|\bil\b|atlanta|denver|los angeles|palo alto|mountain view|remote,? us|us remote)/;

export function detectCountry(location = "") {
  const l = ` ${location.toLowerCase()} `;
  const ca = CA_HINTS.test(l);
  const us = US_HINTS.test(l);
  if (ca && us) return "Cross-Border";
  if (ca) return "Canada";
  if (us) return "USA";
  return "International";
}

export function detectWorkType(location = "", title = "", remoteFlag = false) {
  const s = `${location} ${title}`.toLowerCase();
  if (remoteFlag || /\bremote\b/.test(s)) return "Remote";
  if (/hybrid/.test(s)) return "Hybrid";
  return "Onsite";
}
