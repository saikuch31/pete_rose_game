import { NextResponse } from "next/server";

import { loadAthleteCatalog } from "@/lib/load-athlete-catalog";

export async function GET(request: Request) {
  try {
    const catalog = await loadAthleteCatalog();
    const { searchParams } = new URL(request.url);
    if (searchParams.get("random") === "1") {
      const athlete = catalog.random();
      return NextResponse.json({
        athlete: {
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          displayName: athlete.displayName,
          sport: athlete.sport,
          isProfessional: athlete.isProfessional,
          isNickname: athlete.isNickname,
        },
      });
    }

    const query = searchParams.get("q") ?? "";
    const letter = searchParams.get("letter") ?? undefined;
    const suggestions = catalog.suggest(query, letter).map((athlete) => ({
      displayName: athlete.displayName,
      sport: athlete.sport,
    }));
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ error: "Athlete lookup is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name =
    typeof body === "object" && body !== null && "name" in body
      ? (body as { name?: unknown }).name
      : null;
  const requiredLetter =
    typeof body === "object" && body !== null && "requiredLetter" in body
      ? (body as { requiredLetter?: unknown }).requiredLetter
      : undefined;
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "A full athlete name is required." }, { status: 400 });
  }

  try {
    const catalog = await loadAthleteCatalog();
    const athlete = catalog.find(name);
    if (!athlete) {
      const closest = catalog.findClosest(
        name,
        typeof requiredLetter === "string" ? requiredLetter : undefined,
      );
      return NextResponse.json({ athlete: null, suggestion: closest });
    }

    return NextResponse.json({
      athlete: {
        firstName: athlete.firstName,
        lastName: athlete.lastName,
        displayName: athlete.displayName,
        sport: athlete.sport,
        isProfessional: athlete.isProfessional,
        isNickname: athlete.isNickname,
      },
      suggestion: null,
    });
  } catch {
    return NextResponse.json({ error: "Athlete lookup is unavailable." }, { status: 503 });
  }
}
