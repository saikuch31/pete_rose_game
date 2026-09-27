import { AthleteCatalog, type AthleteRecord } from "./athlete-catalog";
import { supabase } from "./supabase";

export async function loadAthleteCatalog(): Promise<AthleteCatalog> {
  const athletes: AthleteRecord[] = [];
  const pageSize = 1000;

  // Read every page so Supabase's row limit does not truncate the catalog.
  for (let offset = 0; ; ) {
    const { data, error } = await supabase
      .from("athletes")
      .select("id, import_id, first_name, last_name, display_name, normalized_name, sport, is_professional, is_nickname, alternate_names, needs_review")
      .order("id")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Athlete lookup failed: ${error.message}`);
    if (!data?.length) break;

    athletes.push(...data.map((row) => ({
      id: String(row.id),
      importId: row.import_id,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      normalizedName: row.normalized_name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US"),
      sport: row.sport,
      isProfessional: row.is_professional,
      isNickname: row.is_nickname,
      alternateNames: row.alternate_names ?? [],
      needsReview: row.needs_review,
    })));
    offset += data.length;
  }

  return new AthleteCatalog(athletes);
}
