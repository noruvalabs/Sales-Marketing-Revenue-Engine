export interface ParsedLead {
  name: string;
  domain: string;
  industry?: string;
  size?: string;
  hiringSignals?: string;
  contactName?: string;
  contactEmail?: string;
  contactTitle?: string;
}

export function parseCSVLeads(csvText: string): { leads: ParsedLead[]; errors: string[] } {
  const lines = csvText.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { leads: [], errors: ["CSV file must contain a header row and at least one data row."] };
  }

  // Parse Header
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/["']/g, ""));
  const findCol = (aliases: string[]) => headers.findIndex((h) => aliases.some((a) => h.includes(a)));

  const nameIdx = findCol(["company", "organization", "name", "business"]);
  const domainIdx = findCol(["domain", "website", "url", "site"]);
  const emailIdx = findCol(["email", "mail", "contact_email"]);
  const contactNameIdx = findCol(["contact", "person", "full_name", "first_name", "lead"]);
  const titleIdx = findCol(["title", "role", "position", "job"]);
  const hiringIdx = findCol(["hiring", "signals", "signal", "openings", "jobs"]);
  const sizeIdx = findCol(["size", "employees", "headcount"]);
  const industryIdx = findCol(["industry", "vertical", "sector", "category"]);

  if (nameIdx === -1 && domainIdx === -1) {
    return {
      leads: [],
      errors: ["Could not detect 'Company' or 'Domain' column header. Please include 'Company' or 'Domain' in the first row."],
    };
  }

  const leads: ParsedLead[] = [];
  const errors: string[] = [];
  const seenDomains = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    // Simple CSV parser handling quotes
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let charIdx = 0; charIdx < rawLine.length; charIdx++) {
      const char = rawLine[charIdx];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim().replace(/^["']|["']$/g, ""));
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^["']|["']$/g, ""));

    const rawDomain = domainIdx !== -1 && values[domainIdx] ? values[domainIdx].trim().toLowerCase() : "";
    const rawName = nameIdx !== -1 && values[nameIdx] ? values[nameIdx].trim() : "";
    const resolvedDomain = rawDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const resolvedName = rawName || (resolvedDomain ? resolvedDomain.split(".")[0] : `Company-${i}`);

    if (!resolvedDomain && !resolvedName) {
      continue;
    }

    const domainKey = (resolvedDomain || resolvedName).toLowerCase();
    if (seenDomains.has(domainKey)) {
      // Deduplicate inside the CSV itself
      continue;
    }
    seenDomains.add(domainKey);

    const contactEmail = emailIdx !== -1 && values[emailIdx] ? values[emailIdx].trim().toLowerCase() : `hello@${resolvedDomain || "domain.com"}`;
    const contactName = contactNameIdx !== -1 && values[contactNameIdx] ? values[contactNameIdx].trim() : "Decision Maker";
    const contactTitle = titleIdx !== -1 && values[titleIdx] ? values[titleIdx].trim() : "VP of Sales";
    const hiringSignals = hiringIdx !== -1 && values[hiringIdx] ? values[hiringIdx].trim() : "Active B2B hiring signals";
    const size = sizeIdx !== -1 && values[sizeIdx] ? values[sizeIdx].trim() : "20-100";
    const industry = industryIdx !== -1 && values[industryIdx] ? values[industryIdx].trim() : "Technology";

    leads.push({
      name: resolvedName,
      domain: resolvedDomain || `${resolvedName.toLowerCase().replace(/\s+/g, "")}.com`,
      industry,
      size,
      hiringSignals,
      contactName,
      contactEmail,
      contactTitle,
    });
  }

  return { leads, errors };
}

